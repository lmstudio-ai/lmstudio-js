import { makePromise } from "@lmstudio/lms-common";
import { z } from "zod";
import {
  type ChatMessage,
  type LLM,
  LMStudioClient,
  type PredictionResult,
  tool,
} from "../index.js";
import { ensureHeavyTestsEnvironment, llmTestingQwen05B } from "../shared.heavy.test.js";
import { unimplementedRawFunctionTool } from "./tool.js";

describe("LLM.act", () => {
  let client: LMStudioClient;
  let model: LLM;
  const addImplementation = jest.fn(({ a, b }) => a + b);
  const additionTool = tool({
    name: "add",
    description: "Add two numbers",
    parameters: { a: z.number(), b: z.number() },
    implementation: addImplementation,
  });
  beforeAll(async () => {
    client = new LMStudioClient();
    await ensureHeavyTestsEnvironment(client);
  });
  beforeEach(async () => {
    model = await client.llm.model(llmTestingQwen05B, {
      verbose: false,
      config: {
        llamaKCacheQuantizationType: "f32",
        llamaVCacheQuantizationType: "f32",
      },
    });
  }, 60_000);
  it("should call the tool with the correct parameters", async () => {
    const onMessage = jest.fn();
    const onFirstToken = jest.fn();
    const onPredictionCompleted = jest.fn();
    const onPredictionFragment = jest.fn();
    const onPromptProcessingProgress = jest.fn();
    const onRoundStart = jest.fn();
    const onRoundEnd = jest.fn();

    await model.act('First say "Hi". Then calculate 1 + 3 with the tool.', [additionTool], {
      temperature: 0,
      onMessage,
      onFirstToken,
      onPredictionCompleted,
      onPredictionFragment,
      onPromptProcessingProgress,
      onRoundStart,
      onRoundEnd,
    });
    expect(addImplementation).toHaveBeenCalledTimes(1);
    expect(addImplementation.mock.calls[0][0]).toEqual({ a: 1, b: 3 });
    expect(onMessage).toHaveBeenCalledTimes(3);

    const message0 = onMessage.mock.calls[0][0] as ChatMessage;
    expect(message0.getRole()).toBe("assistant");
    expect(message0.getText()).toContain("Hi");
    const message1 = onMessage.mock.calls[1][0] as ChatMessage;
    expect(message1.getRole()).toBe("tool");
    expect(message1.getText()).toBe("");
    const message2 = onMessage.mock.calls[2][0] as ChatMessage;
    expect(message2.getRole()).toBe("assistant");
    expect(message2.getText()).toContain("4");

    expect(onFirstToken.mock.calls).toEqual([[0], [1]]);

    expect(onPredictionCompleted).toHaveBeenCalledTimes(2);
    const prediction0 = onPredictionCompleted.mock.calls[0][0] as PredictionResult;
    expect(prediction0.content).toContain("Hi");
    expect(prediction0.roundIndex).toEqual(0);
    expect(prediction0.modelInfo).toMatchSnapshot({
      identifier: expect.any(String),
      instanceReference: expect.any(String),
      modelKey: expect.any(String),
    });
    expect(prediction0.stats).toMatchSnapshot({
      numGpuLayers: expect.any(Number),
      timeToFirstTokenSec: expect.any(Number),
      tokensPerSecond: expect.any(Number),
      totalTimeSec: expect.any(Number),
    });
    const prediction1 = onPredictionCompleted.mock.calls[1][0] as PredictionResult;
    expect(prediction1.content).toContain("4");
    expect(prediction1.roundIndex).toEqual(1);
    expect(prediction1.modelInfo).toMatchSnapshot({
      identifier: expect.any(String),
      instanceReference: expect.any(String),
      modelKey: expect.any(String),
    });
    expect(prediction1.stats).toMatchSnapshot({
      numGpuLayers: expect.any(Number),
      timeToFirstTokenSec: expect.any(Number),
      tokensPerSecond: expect.any(Number),
      totalTimeSec: expect.any(Number),
    });

    // Cannot assert on content due to non-determinism
    expect(onPredictionFragment).toHaveBeenCalled();

    expect(onPromptProcessingProgress).toHaveBeenCalledWith(0, 0);
    expect(onPromptProcessingProgress).toHaveBeenCalledWith(0, 1);
    expect(onPromptProcessingProgress).toHaveBeenCalledWith(1, 0);
    expect(onPromptProcessingProgress).toHaveBeenCalledWith(1, 1);

    expect(onRoundStart).toHaveBeenCalledTimes(2);
    expect(onRoundStart.mock.calls).toEqual([[0], [1]]);

    expect(onRoundEnd).toHaveBeenCalledTimes(2);
    expect(onRoundEnd.mock.calls).toEqual([[0], [1]]);
  });
  it("should queue up tool calls", async () => {
    // In this test, we will make the model call the tool twice in parallel. We will then make the
    // first tool call be artificially long by using a promise that is not resolved until the
    // prediction is completed (but not the round).

    const calls: Array<string> = [];

    // Promises that will only be resolved after the prediction is completed. This is to
    // artificially lengthen the execution of the first tool call.
    const { promise, resolve } = makePromise<void>();

    const onPredictionCompleted = jest.fn(() => {
      // Record predictionCompleted
      calls.push("predictionCompleted");
      resolve();
    });
    const onToolCallRequestEnd = jest.fn();
    const onToolCallRequestDequeued = jest.fn();

    const additionToolWithQueueControl = tool({
      name: "add",
      description: "Add two numbers",
      parameters: { a: z.number(), b: z.number() },
      implementation: async ({ a, b }) => {
        if (a === 1 && b === 3) {
          calls.push("firstCall");
          await promise; // Wait for the promise to be resolved
          return 4;
        } else if (a === 2 && b === 4) {
          calls.push("secondCall");
          return 6;
        } else {
          throw new Error(`Unexpected parameters: a=${a}, b=${b}`);
        }
      },
    });

    await model.act(
      "Calculate 1 + 3 and 2 + 4 with the tool in parallel.",
      [additionToolWithQueueControl],
      {
        temperature: 0,
        onPredictionCompleted,
        onToolCallRequestEnd,
        onToolCallRequestDequeued,
      },
    );

    expect(calls).toEqual([
      "firstCall",
      "predictionCompleted",
      // Due to queueing, the second call will only be executed after prediction is completed
      "secondCall",
      "predictionCompleted", // Model will say stuff afterwards
    ]);

    expect(onToolCallRequestEnd).toHaveBeenCalledTimes(2);
    expect(onToolCallRequestEnd.mock.calls[0]).toMatchObject([
      0, // roundIndex
      expect.any(Number), // callId
      { isQueued: false }, // First call is not queued
    ]);
    expect(onToolCallRequestEnd.mock.calls[1]).toMatchObject([
      0, // roundIndex
      expect.any(Number), // callId
      { isQueued: true }, // Second call is queued
    ]);
    expect(onToolCallRequestDequeued).toHaveBeenCalledTimes(1);
  });
  it("should not queue up tool calls when allowParallelToolExecution is true", async () => {
    // In this test, we will make the model call the tool twice in parallel. We will then make the
    // first tool call be artificially long by using a promise that is not resolved until the
    // prediction is completed (but not the round). However, since this time
    // allowParallelToolExecution is true, the second tool call will be executed in parallel with
    // the first one despite the first one taking longer to complete.

    const calls: Array<string> = [];

    // Promises that will only be resolved after the prediction is completed. This is to
    // artificially lengthen the execution of the first tool call.
    const { promise, resolve } = makePromise<void>();

    const onPredictionCompleted = jest.fn(() => {
      // Record predictionCompleted
      calls.push("predictionCompleted");
      resolve();
    });
    const onToolCallRequestEnd = jest.fn();
    const onToolCallRequestDequeued = jest.fn();

    const additionToolWithQueueControl = tool({
      name: "add",
      description: "Add two numbers",
      parameters: { a: z.number(), b: z.number() },
      implementation: async ({ a, b }) => {
        if (a === 1 && b === 3) {
          calls.push("firstCall");
          await promise; // Wait for the promise to be resolved
          return 4;
        } else if (a === 2 && b === 4) {
          calls.push("secondCall");
          return 6;
        } else {
          throw new Error(`Unexpected parameters: a=${a}, b=${b}`);
        }
      },
    });

    await model.act(
      "Calculate 1 + 3 and 2 + 4 with the tool in parallel.",
      [additionToolWithQueueControl],
      {
        temperature: 0,
        onPredictionCompleted,
        onToolCallRequestEnd,
        onToolCallRequestDequeued,
        allowParallelToolExecution: true,
      },
    );

    expect(calls).toEqual([
      "firstCall",
      "secondCall",
      "predictionCompleted", // First prediction completed
      "predictionCompleted", // Model will say stuff afterwards
    ]);
    expect(onToolCallRequestEnd.mock.calls[0]).toMatchObject([
      0, // roundIndex
      expect.any(Number), // callId
      { isQueued: false }, // First call is not queued
    ]);
    expect(onToolCallRequestEnd.mock.calls[1]).toMatchObject([
      0, // roundIndex
      expect.any(Number), // callId
      { isQueued: false }, // Second call is also not queued
    ]);
    expect(onToolCallRequestDequeued).toHaveBeenCalledTimes(0);
  });
  it("should handle unimplemented tool", async () => {
    const unimplementedAddTool = unimplementedRawFunctionTool({
      name: "add",
      description: "Add two numbers",
      parametersJsonSchema: {
        type: "object",
        properties: {
          a: { type: "number" },
          b: { type: "number" },
        },
        required: ["a", "b"],
      },
    });

    const onToolCallRequestNameReceived = jest.fn();
    const onToolCallRequestArgumentFragmentGenerated = jest.fn();

    await model.act("Please calculate 1 + 3 with the tool.", [unimplementedAddTool], {
      onToolCallRequestNameReceived,
      onToolCallRequestArgumentFragmentGenerated,
    });

    expect(onToolCallRequestNameReceived).toHaveBeenCalledTimes(1);
    expect(onToolCallRequestNameReceived.mock.calls[0][2]).toEqual("add");
  });
});
