import { type LLMPredictionFragmentReasoningType } from "@lmstudio/lms-shared-types";
import { z } from "zod";
import { type LLM, LMStudioClient } from "../index.js";
import { ensureHeavyTestsEnvironment, llmTestingQwen05B } from "../shared.heavy.test.js";

describe("LLM.complete", () => {
  let client: LMStudioClient;
  let model: LLM;
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
  it("should work without streaming", async () => {
    const result = await model.complete("1 + 1 = 2; 2 + 2 = ", {
      temperature: 0,
      maxTokens: 3,
      stopStrings: [";"],
    });
    expect(result.content).toMatchInlineSnapshot(`"4"`);
    expect(result.stats).toMatchSnapshot({
      numGpuLayers: expect.any(Number),
      timeToFirstTokenSec: expect.any(Number),
      tokensPerSecond: expect.any(Number),
      totalTimeSec: expect.any(Number),
    });
    expect(result.modelInfo).toMatchSnapshot({
      identifier: expect.any(String),
      instanceReference: expect.any(String),
      modelKey: expect.any(String),
    });
    expect(result.roundIndex).toEqual(0);
  });
  it("should work with streaming", async () => {
    const prediction = model.complete("1 + 1 = 2; 2 + 2 = ", {
      temperature: 0,
      maxTokens: 3,
      stopStrings: [";"],
    });
    const fragments = [];
    for await (const fragment of prediction) {
      fragments.push(fragment);
    }
    expect(fragments).toMatchSnapshot();
    const result = await prediction.result();
    expect(result.content).toEqual("4");
    expect(result.stats).toMatchSnapshot({
      numGpuLayers: expect.any(Number),
      timeToFirstTokenSec: expect.any(Number),
      tokensPerSecond: expect.any(Number),
      totalTimeSec: expect.any(Number),
    });
    expect(result.modelInfo).toMatchSnapshot({
      identifier: expect.any(String),
      instanceReference: expect.any(String),
      modelKey: expect.any(String),
    });
  });
  it("should allow cancel via .cancel()", async () => {
    const prediction = model.complete("1 + 1 = 2; 2 + 2 = ", {
      temperature: 0,
      maxTokens: 50,
    });
    prediction.cancel();
    const result = await prediction.result();
    expect(result.stats.stopReason).toEqual("userStopped");
  });
  it("should allow cancel via abort controller", async () => {
    const controller = new AbortController();
    const prediction = model.complete("1 + 1 = 2; 2 + 2 = ", {
      temperature: 0,
      maxTokens: 50,
      signal: controller.signal,
    });
    controller.abort();
    const result = await prediction.result();
    expect(result.stats.stopReason).toEqual("userStopped");
  });
  it("should call onFirstToken", async () => {
    const onFirstToken = jest.fn();
    await model.complete("1 + 1 = 2; 2 + 2 = ", {
      temperature: 0,
      maxTokens: 1,
      stopStrings: [";"],
      onFirstToken,
    });
    expect(onFirstToken).toHaveBeenCalled();
  });
  it("should call onPromptProcessingProgress", async () => {
    const onPromptProcessingProgress = jest.fn();
    await model.complete("1 + 1 = 2; 2 + 2 = ", {
      temperature: 0,
      maxTokens: 1,
      stopStrings: [";"],
      onPromptProcessingProgress,
    });
    expect(onPromptProcessingProgress).toHaveBeenCalledWith(0);
    expect(onPromptProcessingProgress).toHaveBeenCalledWith(1);
  });
  it("should call onPredictionFragment", async () => {
    const onPredictionFragment = jest.fn();
    await model.complete("1 + 1 = 2; 2 + 2 = ", {
      temperature: 0,
      maxTokens: 3,
      onPredictionFragment,
    });
    const calls = onPredictionFragment.mock.calls;
    // Note: The this seem to contain wrong results as it only has 2 tokens. It might be an engine
    // but. We can correct the snapshot once the engine bug is fixed.
    expect(calls).toMatchSnapshot();
  });
  it("should support structured prediction with JSON schema", async () => {
    const resultJSONSchema = {
      type: "object",
      properties: {
        answer: { type: "number" },
      },
      required: ["answer"],
    };
    const result = await model.complete("1 + 1 in JSON is", {
      temperature: 0,
      maxTokens: 15,
      structured: {
        type: "json",
        jsonSchema: resultJSONSchema,
      },
    });
    expect(JSON.parse(result.content)).toMatchSnapshot();
  });
  it("should support structured prediction with zod schema", async () => {
    const resultSchema = z.object({
      answer: z.number(),
    });
    const result = await model.complete("1 + 1 in JSON is", {
      temperature: 0,
      maxTokens: 15,
      structured: resultSchema,
    });
    expect(JSON.parse(result.content)).toMatchSnapshot();
    expect(result.parsed).toMatchSnapshot();
  });
  it("should support structured generation with GBNF grammar", async () => {
    const gbnfGrammar = `
      ans ::= "2" | "random"
      root ::= "Oh no, I am possessed! And 1 + 1 is " ans
    `;
    const result = await model.complete("I would say... ", {
      temperature: 0,
      structured: { type: "gbnf", gbnfGrammar },
    });
    expect(result.content).toMatchSnapshot();
  });
  it("should support reasoning content parsing", async () => {
    const fragmentsWithReasoningType: Array<{
      content: string;
      reasoningType: LLMPredictionFragmentReasoningType;
    }> = [];

    const result = await model.complete("1 through 10: 1,2,3,", {
      temperature: 0,
      maxTokens: 20,
      stopStrings: ["9"],
      reasoningParsing: { enabled: true, startString: "5", endString: "7" },
      onPredictionFragment: fragment => {
        fragmentsWithReasoningType.push({
          content: fragment.content,
          reasoningType: fragment.reasoningType,
        });
      },
    });
    expect(result.content).toMatchInlineSnapshot(`"4,5,6,7,8,"`);
    expect(result.reasoningContent).toMatchInlineSnapshot(`",6,"`);
    expect(result.nonReasoningContent).toMatchInlineSnapshot(`"4,,8,"`);
    expect(fragmentsWithReasoningType).toMatchSnapshot();
  });
});
