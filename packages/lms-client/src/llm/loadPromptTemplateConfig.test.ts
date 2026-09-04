import { SimpleLogger, Validator } from "@lmstudio/lms-common";
import { type LLMPort } from "@lmstudio/lms-external-backend-interfaces";
import {
  collapseKVStack,
  emptyKVConfig,
  globalConfigSchematics,
  kvConfigToLLMLoadModelConfig,
  kvConfigToLLMPredictionConfig,
  llmLoadModelConfigToKVConfig,
  llmPredictionConfigToKVConfig,
} from "@lmstudio/lms-kv-config";
import {
  type KVConfig,
  type KVConfigStack,
  type LLMLoadModelConfig,
  llmLoadModelConfigSchema,
  type LLMInstanceInfo,
  type LLMPredictionConfig,
  type ModelCompatibilityType,
} from "@lmstudio/lms-shared-types";
import { type LMStudioClient } from "../LMStudioClient.js";
import { LLMNamespace } from "./LLMNamespace.js";

interface CapturedChannelCreation {
  endpointName: string;
  creationParameter: unknown;
}

interface LLMNamespaceHarness {
  namespace: LLMNamespace;
  capturedChannelCreations: Array<CapturedChannelCreation>;
  setLoadConfigResponse: (loadConfig: KVConfig) => void;
}

const customLoadPromptTemplate: NonNullable<LLMLoadModelConfig["promptTemplate"]> = {
  type: "jinja",
  jinjaPromptTemplate: {
    template: "{% for message in messages %}{{ message.content }}{% endfor %}",
  },
};

const predictionPromptTemplate: NonNullable<LLMPredictionConfig["promptTemplate"]> = {
  type: "jinja",
  jinjaPromptTemplate: {
    template: "{{ messages }}",
  },
  stopStrings: ["<prediction-stop>"],
};

const llamaCppArgumentsOverride: NonNullable<LLMLoadModelConfig["llamaCppArgumentsOverride"]> = {
  enabled: true,
  disabledParameters: ["--batch-size"],
  overrideParameters: [
    { key: "--threads", value: "8" },
    { key: "--no-context-shift", value: "" },
  ],
  excludeAllConfig: false,
};

function createInstanceInfo(format: ModelCompatibilityType = "gguf"): LLMInstanceInfo {
  return {
    type: "llm",
    modelKey: "test/model",
    format,
    displayName: "Test Model",
    publisher: "test",
    path: "/test/model.gguf",
    sizeBytes: 0,
    indexedModelIdentifier: "test/model",
    deviceIdentifier: null,
    identifier: "test-instance",
    instanceReference: "test-instance",
    ttlMs: null,
    lastUsedTime: null,
    vision: false,
    trainedForToolUse: false,
    maxContextLength: 4096,
    contextLength: 4096,
  };
}

function createSilentLogger(): SimpleLogger {
  return new SimpleLogger("loadPromptTemplateConfigTest", {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  });
}

function createNamespaceHarness(modelFormat: ModelCompatibilityType = "gguf"): LLMNamespaceHarness {
  const capturedChannelCreations: Array<CapturedChannelCreation> = [];
  let loadConfigResponse: KVConfig = emptyKVConfig;
  const port = {
    createChannel: (
      endpointName: string,
      creationParameter: unknown,
      onMessage: (message: unknown) => void,
    ) => {
      capturedChannelCreations.push({ endpointName, creationParameter });
      queueMicrotask(() => {
        if (endpointName === "loadModel") {
          onMessage({
            type: "success",
            info: createInstanceInfo(modelFormat),
          });
          return;
        }
        if (endpointName === "getOrLoad") {
          onMessage({
            type: "loadSuccess",
            info: createInstanceInfo(modelFormat),
          });
          return;
        }
        throw new Error(`Unexpected channel endpoint: ${endpointName}`);
      });
      return {
        onError: {
          subscribeOnce: () => {},
        },
        send: () => {},
      };
    },
    callRpc: async (endpointName: string) => {
      if (endpointName === "getLoadConfig") {
        return loadConfigResponse;
      }
      if (endpointName === "getModelInfo") {
        return createInstanceInfo(modelFormat);
      }
      throw new Error(`Unexpected RPC endpoint: ${endpointName}`);
    },
  } as unknown as LLMPort;

  return {
    namespace: new LLMNamespace(
      {} as unknown as LMStudioClient,
      port,
      createSilentLogger(),
      new Validator({ attachStack: false }),
    ),
    capturedChannelCreations,
    setLoadConfigResponse: (loadConfig: KVConfig) => {
      loadConfigResponse = loadConfig;
    },
  };
}

function extractLoadConfigStack(creationParameter: unknown): KVConfigStack {
  if (
    typeof creationParameter !== "object" ||
    creationParameter === null ||
    !("loadConfigStack" in creationParameter)
  ) {
    throw new Error("Expected channel creation parameter to include loadConfigStack.");
  }

  return (creationParameter as { loadConfigStack: KVConfigStack }).loadConfigStack;
}

function resolveLoadPromptTemplate(loadConfigStack: KVConfigStack) {
  return globalConfigSchematics.access(
    collapseKVStack(loadConfigStack),
    "llm.load.promptTemplate",
  );
}

describe("SDK load prompt template config", () => {
  test("load config schema accepts load-time prompt template", () => {
    expect(
      llmLoadModelConfigSchema.parse({
        promptTemplate: customLoadPromptTemplate,
      }),
    ).toEqual({
      promptTemplate: customLoadPromptTemplate,
    });
  });

  test("client.llm.load maps promptTemplate to llm.load.promptTemplate", async () => {
    const harness = createNamespaceHarness();

    await harness.namespace.load("test/model", {
      verbose: false,
      config: {
        promptTemplate: customLoadPromptTemplate,
      },
    });

    const capturedCreation = harness.capturedChannelCreations[0];
    expect(capturedCreation?.endpointName).toBe("loadModel");
    expect(resolveLoadPromptTemplate(extractLoadConfigStack(capturedCreation?.creationParameter)))
      .toEqual(customLoadPromptTemplate);
  });

  test("client.llm.model maps promptTemplate to llm.load.promptTemplate", async () => {
    const harness = createNamespaceHarness();

    await harness.namespace.model("test/model", {
      verbose: false,
      config: {
        promptTemplate: customLoadPromptTemplate,
      },
    });

    const capturedCreation = harness.capturedChannelCreations[0];
    expect(capturedCreation?.endpointName).toBe("getOrLoad");
    expect(resolveLoadPromptTemplate(extractLoadConfigStack(capturedCreation?.creationParameter)))
      .toEqual(customLoadPromptTemplate);
  });

  test("getLoadConfig round-trips explicitly configured custom templates", async () => {
    const harness = createNamespaceHarness();
    harness.setLoadConfigResponse(
      llmLoadModelConfigToKVConfig({
        promptTemplate: customLoadPromptTemplate,
      }),
    );
    const model = await harness.namespace.load("test/model", { verbose: false });
    const loadConfig = await model.getLoadConfig();

    expect(loadConfig.promptTemplate).toEqual(customLoadPromptTemplate);
  });

  test("getLoadConfig supports Torch SafeTensors models", async () => {
    const harness = createNamespaceHarness("torch_safetensors");
    harness.setLoadConfigResponse(llmLoadModelConfigToKVConfig({ maxParallelPredictions: 256 }));
    const model = await harness.namespace.load("test/model", { verbose: false });

    expect((await model.getLoadConfig()).maxParallelPredictions).toBe(256);
  });

  test("getLoadConfig does not synthesize prompt templates when absent", async () => {
    const harness = createNamespaceHarness();
    harness.setLoadConfigResponse(emptyKVConfig);
    const model = await harness.namespace.load("test/model", { verbose: false });
    const loadConfig = await model.getLoadConfig();

    expect(loadConfig.promptTemplate).toBeUndefined();
  });

  test("raw load config conversion preserves absent prompt template with defaults", () => {
    expect(kvConfigToLLMLoadModelConfig(emptyKVConfig).promptTemplate).toBeUndefined();
    expect(
      kvConfigToLLMLoadModelConfig(emptyKVConfig, {
        useDefaultsForMissingKeys: true,
      }).promptTemplate,
    ).toBeUndefined();
  });

  test("client.llm.load maps llama.cpp argument overrides to load config", async () => {
    const harness = createNamespaceHarness();

    await harness.namespace.load("test/model", {
      verbose: false,
      config: { llamaCppArgumentsOverride },
    });

    const capturedCreation = harness.capturedChannelCreations[0];
    expect(capturedCreation?.endpointName).toBe("loadModel");
    expect(
      globalConfigSchematics.access(
        collapseKVStack(extractLoadConfigStack(capturedCreation?.creationParameter)),
        "llm.load.llama.argumentsOverride",
      ),
    ).toEqual(llamaCppArgumentsOverride);
  });

  test("getLoadConfig round-trips llama.cpp argument overrides", async () => {
    const harness = createNamespaceHarness();
    harness.setLoadConfigResponse(
      llmLoadModelConfigToKVConfig({ llamaCppArgumentsOverride }),
    );
    const model = await harness.namespace.load("test/model", { verbose: false });

    expect((await model.getLoadConfig()).llamaCppArgumentsOverride).toEqual(
      llamaCppArgumentsOverride,
    );
  });

  test("SDK prediction-time promptTemplate remains a client-side prediction config", () => {
    const predictionConfig = llmPredictionConfigToKVConfig({
      promptTemplate: predictionPromptTemplate,
    });

    expect(
      kvConfigToLLMPredictionConfig(predictionConfig, {
        useDefaultsForMissingKeys: true,
      }).promptTemplate,
    ).toEqual(predictionPromptTemplate);
  });
});
