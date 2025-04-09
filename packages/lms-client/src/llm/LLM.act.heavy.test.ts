import { z } from "zod";
import {
  type ChatMessage,
  type LLM,
  LMStudioClient,
  type PredictionResult,
  tool,
} from "../index.js";
import { ensureHeavyTestsEnvironment, llmTestingQwen05B } from "../shared.heavy.test.js";

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
});
