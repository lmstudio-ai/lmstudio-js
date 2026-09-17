import { SimpleLogger, Validator } from "@lmstudio/lms-common";
import { type LLMPort } from "@lmstudio/lms-external-backend-interfaces";
import { collapseKVStack, globalConfigSchematics } from "@lmstudio/lms-kv-config";
import {
  type KVConfig,
  type KVConfigStack,
  type LLMInstanceInfo,
} from "@lmstudio/lms-shared-types";
import { Chat } from "../Chat.js";
import { LLMDynamicHandle } from "./LLMDynamicHandle.js";

interface CapturedChannelCreation {
  endpointName: string;
  creationParameter: unknown;
}

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
  return new SimpleLogger("rawCompletionChannelTest", {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  });
}

function createHandleHarness({
  loadModelConfig = { fields: [] },
  modelInfo = createInstanceInfo(),
}: { loadModelConfig?: KVConfig; modelInfo?: LLMInstanceInfo } = {}) {
  const capturedChannelCreations = new Array<CapturedChannelCreation>();
  const port = {
    createChannel: (
      endpointName: string,
      creationParameter: unknown,
      onMessage: (message: unknown) => void,
    ) => {
      capturedChannelCreations.push({ endpointName, creationParameter });
      queueMicrotask(() => {
        if (endpointName !== "predict" && endpointName !== "completeRawText") {
          throw new Error(`Unexpected channel endpoint: ${endpointName}`);
        }
        onMessage({
          type: "success",
          stats: { stopReason: "eosFound" },
          modelInfo,
          loadModelConfig,
          predictionConfig: { fields: [] },
        });
      });
      return {
        onError: {
          subscribeOnce: () => {},
        },
        send: () => {},
      };
    },
  } as unknown as LLMPort;

  return {
    handle: new LLMDynamicHandle(
      port,
      { type: "instanceReference", instanceReference: "test-instance" },
      new Validator({ attachStack: false }),
      createSilentLogger(),
    ),
    capturedChannelCreations,
  };
}

function getPredictionConfigStack(creationParameter: unknown): KVConfigStack {
  if (
    typeof creationParameter !== "object" ||
    creationParameter === null ||
    !("predictionConfigStack" in creationParameter)
  ) {
    throw new Error("Expected channel creation parameter to include predictionConfigStack.");
  }

  return (creationParameter as { predictionConfigStack: KVConfigStack }).predictionConfigStack;
}

describe("LLMDynamicHandle raw completion channel", () => {
  test.each(["complete", "respond"] as const)(
    "%s result snapshot preserves config-mode omissions",
    async method => {
      const engineConfigFileContents = "max-model-len: auto\n";
      const harness = createHandleHarness({
        modelInfo: { ...createInstanceInfo(), format: "torch_safetensors", contextLength: 32768 },
        loadModelConfig: globalConfigSchematics.buildPartialConfig({
          "llm.load.engineConfigFileContents": engineConfigFileContents,
          "llm.load.engineCwd": "",
          "llm.load.contextLength": 32768,
        }),
      });
      const result = await harness.handle[method]("hello");
      expect(result.loadConfig).toEqual(
        globalConfigSchematics.buildPartialConfig({
          "llm.load.engineConfigFileContents": engineConfigFileContents,
          "llm.load.engineCwd": "",
          "llm.load.contextLength": 32768,
        }),
      );
    },
  );
  test("complete opens completeRawText with rawPrompt", async () => {
    const harness = createHandleHarness();

    await harness.handle.complete("raw prompt");

    const capturedCreation = harness.capturedChannelCreations[0];
    expect(capturedCreation?.endpointName).toBe("completeRawText");
    expect(capturedCreation?.creationParameter).toMatchObject({
      rawPrompt: "raw prompt",
      modelSpecifier: { type: "instanceReference", instanceReference: "test-instance" },
    });
    const predictionConfigStack = getPredictionConfigStack(capturedCreation?.creationParameter);
    expect(predictionConfigStack.layers.map(layer => layer.layerName)).toEqual(["apiOverride"]);
    expect(
      globalConfigSchematics.access(
        collapseKVStack(predictionConfigStack),
        "llm.prediction.stopStrings",
      ),
    ).toEqual([]);
  });

  test.each([
    ["rawTools", { rawTools: { type: "none" } }],
    ["toolChoice", { toolChoice: { type: "generic", mode: "none" } }],
  ] as const)("complete rejects explicit %s config before opening a channel", (_label, opts) => {
    const harness = createHandleHarness();

    expect(() => harness.handle.complete("raw prompt", opts)).toThrow(
      "Tools are not supported in model.complete().",
    );
    expect(harness.capturedChannelCreations).toEqual([]);
  });

  test("complete rejects an explicitly enabled reasoning budget", () => {
    const harness = createHandleHarness();

    expect(() => harness.handle.complete("raw prompt", { reasoningBudget: 10 })).toThrow(
      "Reasoning budgets are not supported in model.complete().",
    );
    expect(harness.capturedChannelCreations).toEqual([]);
  });

  test("complete accepts an explicitly disabled reasoning budget", async () => {
    const harness = createHandleHarness();

    await harness.handle.complete("raw prompt", { reasoningBudget: false });

    expect(harness.capturedChannelCreations[0]?.endpointName).toBe("completeRawText");
    const predictionConfigStack = getPredictionConfigStack(
      harness.capturedChannelCreations[0]?.creationParameter,
    );
    expect(
      globalConfigSchematics.access(
        collapseKVStack(predictionConfigStack),
        "llm.prediction.reasoning.budgetTokens",
      ),
    ).toEqual({ checked: false, value: 1024 });
  });

  test("respond remains on predict", async () => {
    const harness = createHandleHarness();

    await harness.handle.respond(Chat.from([{ role: "user", content: "hello" }]));

    expect(harness.capturedChannelCreations[0]?.endpointName).toBe("predict");
  });
});
