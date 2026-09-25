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
  type GPUSplitConfig,
  type GPUSetting,
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
  capturedRpcCalls: Array<{ endpointName: string; parameter: unknown }>;
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
  const capturedRpcCalls: Array<{ endpointName: string; parameter: unknown }> = [];
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
    callRpc: async (endpointName: string, parameter: unknown) => {
      capturedRpcCalls.push({ endpointName, parameter });
      if (endpointName === "estimateModelUsage") {
        return {
          passesGuardrails: true,
          memory: {
            confidence: "high",
            modelVramBytes: 0,
            contextVramBytes: 0,
            totalVramBytes: 0,
            modelBytes: 0,
            contextBytes: 0,
            totalBytes: 0,
          },
        };
      }
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
    capturedRpcCalls,
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
  return globalConfigSchematics.access(collapseKVStack(loadConfigStack), "llm.load.promptTemplate");
}

describe("SDK engine config file", () => {
  test.each([
    {},
    { engineConfigFileContents: "" },
    { engineCwd: "" },
    {
      engineConfigFileContents: "# keep exactly\r\nchat-template: ./templates/custom.jinja\r\n",
      engineCwd: "/host/assets",
    },
  ])("schema and pure KV conversion preserve explicit values and omission (%j)", config => {
    expect(llmLoadModelConfigSchema.parse(config)).toEqual(config);
    const raw = llmLoadModelConfigToKVConfig(config);
    expect(kvConfigToLLMLoadModelConfig(raw, { modelFormat: "torch_safetensors" })).toEqual(config);
  });

  test.each([undefined, "", "/user assets"])(
    "typed reporting retains launch contents, configured CWD and actual context (%s)",
    async engineCwd => {
      const harness = createNamespaceHarness("torch_safetensors");
      const expected = {
        engineConfigFileContents: "max-model-len: auto\n",
        engineCwd,
        contextLength: 32768,
      };
      harness.setLoadConfigResponse(llmLoadModelConfigToKVConfig(expected));
      const model = await harness.namespace.load("test/model", { verbose: false });
      expect(await model.getLoadConfig()).toEqual(expected);
    },
  );

  test.each([undefined, false, true])(
    "config-file reporting omits inactive AutoFit and retains effective context (%s)",
    autoFit => {
      const config = globalConfigSchematics.buildPartialConfig({
        "llm.load.engineConfigFileContents": "max-model-len: auto\n",
        "llm.load.contextLength": 32768,
        "llm.load.vllm.autoFit": autoFit,
      });
      expect(
        kvConfigToLLMLoadModelConfig(config, {
          modelFormat: "torch_safetensors",
          useDefaultsForMissingKeys: true,
        }),
      ).toEqual({ engineConfigFileContents: "max-model-len: auto\n", contextLength: 32768 });
    },
  );

  test("normal vLLM conversion still materializes defaults without inventing engine options", () => {
    const converted = kvConfigToLLMLoadModelConfig(emptyKVConfig, {
      modelFormat: "torch_safetensors",
      useDefaultsForMissingKeys: true,
    });
    expect(converted.maxParallelPredictions).toBeDefined();
    expect(converted.seed).toBeDefined();
    expect(converted).not.toHaveProperty("engineConfigFileContents");
    expect(converted).not.toHaveProperty("engineCwd");
  });
});

describe.each(["gguf", "safetensors", "torch_safetensors"] as const)(
  "%s SDK AutoFit validation",
  modelFormat => {
    describe.each(["load", "model", "estimateResourcesUsage"] as const)("%s", method => {
      test.each<GPUSetting>([
        { mainGpu: 0 },
        { splitStrategy: "evenly" },
        { splitStrategy: "evenly", disabledGpus: [] },
        { splitStrategy: "evenly", disabledGpus: [2] },
        { splitStrategy: "favorMainGpu" },
        { mainGpu: 1, splitStrategy: "favorMainGpu", disabledGpus: [2] },
      ])("rejects explicit placement before sending a request: %j", async gpu => {
        const harness = createNamespaceHarness(modelFormat);
        const config: LLMLoadModelConfig = { autoFit: true, gpu };
        const result =
          method === "estimateResourcesUsage"
            ? harness.namespace.estimateResourcesUsage("test/model", config)
            : harness.namespace[method]("test/model", { config, verbose: false });
        await expect(result).rejects.toThrow(
          "autoFit cannot be enabled with manual context, placement, or memory settings",
        );
        expect(harness.capturedChannelCreations).toHaveLength(0);
        expect(harness.capturedRpcCalls).toHaveLength(0);
      });

      test.each<LLMLoadModelConfig>([
        { autoFit: true },
        { autoFit: true, gpu: { disabledGpus: [] } },
        { autoFit: true, gpu: { disabledGpus: [2] } },
        { autoFit: false, gpu: { mainGpu: 1, splitStrategy: "favorMainGpu" } },
        { autoFit: false, gpu: { splitStrategy: "evenly", disabledGpus: [2] } },
        { gpu: { mainGpu: 0 } },
        { gpu: { splitStrategy: "evenly", disabledGpus: [2] } },
      ])("preserves supported settings without request metadata: %j", async config => {
        const harness = createNamespaceHarness(modelFormat);
        let rawRequest: unknown;
        if (method === "estimateResourcesUsage") {
          await harness.namespace.estimateResourcesUsage("test/model", config);
          rawRequest = harness.capturedRpcCalls[0].parameter;
        } else {
          await harness.namespace[method]("test/model", { config, verbose: false });
          rawRequest = harness.capturedChannelCreations[0].creationParameter;
        }
        const request = JSON.parse(JSON.stringify(rawRequest));
        expect(request).not.toHaveProperty("requestedGpuPlacement");
        expect(collapseKVStack(extractLoadConfigStack(request))).toEqual(
          llmLoadModelConfigToKVConfig(config),
        );
      });
    });
  },
);

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
    expect(
      resolveLoadPromptTemplate(extractLoadConfigStack(capturedCreation?.creationParameter)),
    ).toEqual(customLoadPromptTemplate);
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
    expect(
      resolveLoadPromptTemplate(extractLoadConfigStack(capturedCreation?.creationParameter)),
    ).toEqual(customLoadPromptTemplate);
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

  test.each<GPUSplitConfig>([
    { strategy: "evenly", priority: [], disabledGpus: [2], customRatio: [] },
    { strategy: "priorityOrder", priority: [2, 1], disabledGpus: [2], customRatio: [] },
    { strategy: "tensor", priority: [], disabledGpus: [2], customRatio: [] },
    { strategy: "custom", priority: [0], disabledGpus: [1], customRatio: [0, 3, 0] },
    { strategy: "custom", priority: [0], disabledGpus: [1], customRatio: [1, 1, 0] },
  ])("keeps vLLM AutoFit readback reusable without manual placement: %j", async gpuSplitConfig => {
    const harness = createNamespaceHarness("torch_safetensors");
    harness.setLoadConfigResponse(
      globalConfigSchematics.buildPartialConfig({
        "llm.load.vllm.autoFit": true,
        "llm.load.contextLength": 8192,
        "load.gpuSplitConfig": gpuSplitConfig,
      }),
    );
    const model = await harness.namespace.load("test/model", { verbose: false });
    const loadConfig = await model.getLoadConfig();
    expect(loadConfig.autoFit).toBe(true);
    expect(loadConfig.contextLength).toBeUndefined();
    expect(loadConfig.gpu).toEqual({ disabledGpus: gpuSplitConfig.disabledGpus });

    // Exercise SDK validation as well as conversion when reusing the readback.
    await harness.namespace.load("test/model", { verbose: false, config: loadConfig });
    const reapplied = collapseKVStack(
      extractLoadConfigStack(harness.capturedChannelCreations[1]?.creationParameter),
    );
    expect(globalConfigSchematics.access(reapplied, "llm.load.vllm.autoFit")).toBe(true);
    expect(globalConfigSchematics.accessPartial(reapplied, "load.gpuSplitConfig")).toEqual({
      strategy: "evenly",
      priority: [],
      disabledGpus: gpuSplitConfig.disabledGpus,
      customRatio: [],
    });
    expect(reapplied.fields.map(field => field.key)).not.toContain("llm.load.contextLength");
  });

  test.each<NonNullable<LLMLoadModelConfig["gpu"]>>([
    { splitStrategy: "favorMainGpu" },
    { splitStrategy: "favorMainGpu", disabledGpus: [2] },
    { splitStrategy: "evenly" },
    { splitStrategy: "evenly", disabledGpus: [2] },
  ])("omits manual strategies from vLLM AutoFit readback: %j", async gpu => {
    const harness = createNamespaceHarness("torch_safetensors");
    const original = llmLoadModelConfigToKVConfig({ autoFit: true, gpu });
    harness.setLoadConfigResponse(original);
    const model = await harness.namespace.load("test/model", { verbose: false });
    const loadConfig = await model.getLoadConfig();
    expect(loadConfig.autoFit).toBe(true);
    expect(loadConfig.contextLength).toBeUndefined();
    expect(loadConfig.gpu).toEqual({ disabledGpus: gpu.disabledGpus ?? [] });

    await harness.namespace.load("test/model", { verbose: false, config: loadConfig });
    const reapplied = collapseKVStack(
      extractLoadConfigStack(harness.capturedChannelCreations[1]?.creationParameter),
    );
    expect(globalConfigSchematics.accessPartial(reapplied, "llm.load.vllm.autoFit")).toBe(true);
    expect(globalConfigSchematics.accessPartial(reapplied, "load.gpuSplitConfig")).toEqual(
      gpu.disabledGpus?.length
        ? { strategy: "evenly", priority: [], disabledGpus: gpu.disabledGpus, customRatio: [] }
        : undefined,
    );
    expect(reapplied.fields.map(field => field.key)).not.toContain("llm.load.contextLength");
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
    harness.setLoadConfigResponse(llmLoadModelConfigToKVConfig({ llamaCppArgumentsOverride }));
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
