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

function createInstanceInfo(): LLMInstanceInfo {
  return {
    type: "llm",
    modelKey: "test/model",
    format: "gguf",
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

function createNamespaceHarness(): LLMNamespaceHarness {
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
            info: createInstanceInfo(),
          });
          return;
        }
        if (endpointName === "getOrLoad") {
          onMessage({
            type: "loadSuccess",
            info: createInstanceInfo(),
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
        return createInstanceInfo();
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
