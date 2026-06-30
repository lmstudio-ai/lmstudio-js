import { SimpleLogger, Validator } from "@lmstudio/lms-common";
import { type LLMPort } from "@lmstudio/lms-external-backend-interfaces";
import { emptyKVConfig } from "@lmstudio/lms-kv-config";
import {
  type KVConfigStack,
  type LLMInstanceInfo,
  type LLMPredictionFragment,
  type PromptProcessingDetails,
} from "@lmstudio/lms-shared-types";
import { LLMDynamicHandle } from "./LLMDynamicHandle.js";

interface CapturedChannel {
  endpointName: string;
  creationParameter: any;
  sentPackets: Array<unknown>;
  emitMessage: (message: any) => void;
}

function createSilentLogger(): SimpleLogger {
  return new SimpleLogger("LLMDynamicHandle.completionIntent.test", {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  });
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

function createFragment(content: string): LLMPredictionFragment {
  return {
    content,
    tokensCount: 1,
    containsDrafted: false,
    reasoningType: "none",
    isStructural: false,
  };
}

function createPromptProcessingDetails(): PromptProcessingDetails {
  return {
    cachedTokenCount: 0,
    totalPromptTokenCount: 2,
    processedPromptTokenCount: 1,
    unprocessedPromptTokenCount: 1,
  };
}

function createHarness(): { handle: LLMDynamicHandle; channels: Array<CapturedChannel> } {
  const channels: Array<CapturedChannel> = [];
  const port = {
    createChannel: (endpointName: string, creationParameter: unknown, onMessage: (message: any) => void) => {
      const capturedChannel: CapturedChannel = {
        endpointName,
        creationParameter,
        sentPackets: [],
        emitMessage: onMessage,
      };
      channels.push(capturedChannel);
      return {
        onError: {
          subscribeOnce: () => {},
        },
        send: (packet: unknown) => {
          capturedChannel.sentPackets.push(packet);
        },
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
    channels,
  };
}

function sendSuccess(channel: CapturedChannel): void {
  channel.emitMessage({
    type: "success",
    stats: {
      stopReason: "eosFound",
      totalTimeSec: 1,
      tokensPerSecond: 1,
      promptTokensCount: 2,
      predictedTokensCount: 1,
      totalTokensCount: 3,
    },
    modelInfo: createInstanceInfo(),
    loadModelConfig: emptyKVConfig,
    predictionConfig: emptyKVConfig,
  });
}

function getLayerNames(configStack: KVConfigStack): Array<string> {
  return configStack.layers.map(layer => layer.layerName);
}

describe("LLMDynamicHandle completion operation intent", () => {
  test("complete sends raw text-completion intent while preserving completion config stack", async () => {
    const { handle, channels } = createHarness();
    const onPromptProcessingProgress = jest.fn();
    const onPredictionFragment = jest.fn();
    const prediction = handle.complete("raw prompt", {
      maxTokens: 1,
      onPromptProcessingProgress,
      onPredictionFragment,
    });
    const streamedFragmentsPromise = (async () => {
      const fragments: Array<LLMPredictionFragment> = [];
      for await (const fragment of prediction) {
        fragments.push(fragment);
      }
      return fragments;
    })();

    const channel = channels[0];
    expect(channel.endpointName).toBe("predict");
    expect(channel.creationParameter.operationIntent).toEqual({
      type: "rawTextCompletion",
      rawPrompt: "raw prompt",
    });
    expect(channel.creationParameter.history.messages[0].content[0].text).toBe("raw prompt");
    expect(getLayerNames(channel.creationParameter.predictionConfigStack)).toContain(
      "completeModeFormatting",
    );

    const promptProcessingDetails = createPromptProcessingDetails();
    channel.emitMessage({
      type: "promptProcessingProgress",
      progress: 0.5,
      details: promptProcessingDetails,
    });
    channel.emitMessage({ type: "fragment", fragment: createFragment("x") });
    sendSuccess(channel);

    await expect(prediction.result()).resolves.toMatchObject({
      content: "x",
      stats: { promptTokensCount: 2, predictedTokensCount: 1, totalTokensCount: 3 },
    });
    await expect(streamedFragmentsPromise).resolves.toEqual([createFragment("x")]);
    expect(onPromptProcessingProgress).toHaveBeenCalledWith(0.5, promptProcessingDetails);
    expect(onPredictionFragment).toHaveBeenCalledWith(createFragment("x"));
  });

  test("complete cancellation reaches the active predict channel", async () => {
    const { handle, channels } = createHarness();
    const prediction = handle.complete("raw prompt");

    await prediction.cancel();

    expect(channels[0].sentPackets).toEqual([{ type: "cancel" }]);
  });

  test("respond does not send raw text-completion intent", async () => {
    const { handle, channels } = createHarness();
    const prediction = handle.respond([{ role: "user", content: "hello" }]);

    const channel = channels[0];
    expect(channel.endpointName).toBe("predict");
    expect(channel.creationParameter.operationIntent).toBeUndefined();

    sendSuccess(channel);
    await expect(prediction.result()).resolves.toMatchObject({ content: "" });
  });
});
