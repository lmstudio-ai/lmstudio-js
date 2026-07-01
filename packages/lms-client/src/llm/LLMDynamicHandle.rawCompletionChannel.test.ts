import { SimpleLogger, Validator } from "@lmstudio/lms-common";
import { type LLMPort } from "@lmstudio/lms-external-backend-interfaces";
import { collapseKVStack, globalConfigSchematics } from "@lmstudio/lms-kv-config";
import { type KVConfigStack, type LLMInstanceInfo } from "@lmstudio/lms-shared-types";
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

function createHandleHarness() {
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
          modelInfo: createInstanceInfo(),
          loadModelConfig: { fields: [] },
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

  test("respond remains on predict", async () => {
    const harness = createHandleHarness();

    await harness.handle.respond(Chat.from([{ role: "user", content: "hello" }]));

    expect(harness.capturedChannelCreations[0]?.endpointName).toBe("predict");
  });
});
