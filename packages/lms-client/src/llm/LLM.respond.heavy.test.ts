import { type LLMPredictionFragmentReasoningType } from "@lmstudio/lms-shared-types";
import { z } from "zod";
import { Chat, ChatMessage, type LLM, LMStudioClient } from "../index.js";
import { ensureHeavyTestsEnvironment, llmTestingQwen05B } from "../shared.heavy.test.js";

describe("LLM.respond", () => {
  let client: LMStudioClient;
  let model: LLM;
  const chat = Chat.from([
    { role: "system", content: "This is the system prompt." },
    { role: "user", content: "User message 1" },
    { role: "assistant", content: "Assistant message 1" },
    { role: "user", content: "User message 2" },
  ]);
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
    const result = await model.respond(chat, {
      temperature: 0,
      maxTokens: 10,
    });
    expect(result.content).toMatchInlineSnapshot(`"Assistant message 2"`);
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
    const prediction = model.respond(chat, {
      temperature: 0,
      maxTokens: 10,
    });
    const fragments = [];
    for await (const fragment of prediction) {
      fragments.push(fragment);
    }
    // There is a very small chance for this to fail currently due to missing the last fragment.
    // Still investigating.
    expect(fragments).toMatchSnapshot();
    const result = await prediction.result();
    expect(result.content).toMatchSnapshot();
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
    const prediction = model.respond(chat, {
      temperature: 0,
      maxTokens: 50,
    });
    prediction.cancel();
    const result = await prediction.result();
    expect(result.stats.stopReason).toEqual("userStopped");
  });
  it("should allow cancel via abort controller", async () => {
    const controller = new AbortController();
    const prediction = model.respond(chat, {
      temperature: 0,
      maxTokens: 50,
      signal: controller.signal,
    });
    controller.abort();
    const result = await prediction.result();
    expect(result.stats.stopReason).toEqual("userStopped");
  });
  it("should call onFirstToken callback", async () => {
    const onFirstToken = jest.fn();
    await model.respond(chat, {
      temperature: 0,
      maxTokens: 1,
      onFirstToken,
    });
    expect(onFirstToken).toHaveBeenCalled();
  });
  it("should call onPromptProcessingProgress callback", async () => {
    const onPromptProcessingProgress = jest.fn();
    await model.respond(chat, {
      temperature: 0,
      maxTokens: 1,
      onPromptProcessingProgress,
    });
    expect(onPromptProcessingProgress).toHaveBeenCalledWith(0);
    expect(onPromptProcessingProgress).toHaveBeenCalledWith(1);
  });
  it("should call onPredictionFragment callback", async () => {
    const onPredictionFragment = jest.fn();
    await model.respond(chat, {
      temperature: 0,
      maxTokens: 10,
      onPredictionFragment,
    });
    const calls = onPredictionFragment.mock.calls;
    expect(calls).toMatchSnapshot();
  });
  it("should call onMessage callback", async () => {
    const onMessage = jest.fn();
    await model.respond(chat, {
      temperature: 0,
      maxTokens: 10,
      onMessage,
    });
    expect(onMessage).toHaveBeenCalledTimes(1);
    const call = onMessage.mock.calls[0];
    const message = call[0] as ChatMessage;
    expect(message).toBeInstanceOf(ChatMessage);
    expect(message.getRole()).toEqual("assistant");
    expect(message.getText()).toEqual("Assistant message 2");
  });
  it("should work with single string input", async () => {
    const result = await model.respond("User message 1", {
      temperature: 0,
      maxTokens: 10,
    });
    expect(result.content).toMatchInlineSnapshot(`"Hello! How can I assist you today?"`);
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
  it("should work with array of messages input", async () => {
    const result = await model.respond(
      [
        { role: "system", content: "This is the system prompt." },
        { role: "user", content: "User message 1" },
        { role: "assistant", content: "Assistant message 1" },
        { role: "user", content: "User message 2" },
      ],
      {
        temperature: 0,
        maxTokens: 10,
      },
    );
    expect(result.content).toMatchInlineSnapshot(`"Assistant message 2"`);
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
  it("should support structured prediction with JSON schema", async () => {
    const bookJSONSchema = {
      type: "object",
      properties: {
        title: { type: "string" },
        author: { type: "string" },
        year: { type: "integer" },
      },
      required: ["title", "author", "year"],
    };
    const result = await model.respond("Tell me about The Hobbit", {
      temperature: 0,
      structured: {
        type: "json",
        jsonSchema: bookJSONSchema,
      },
    });
    expect(JSON.parse(result.content)).toMatchSnapshot();
  });
  it("should support structured prediction with zod schema", async () => {
    const bookSchema = z.object({
      title: z.string(),
      author: z.string(),
      year: z.number(),
    });
    const result = await model.respond("Tell me about The Hobbit", {
      temperature: 0,
      structured: bookSchema,
    });
    expect(JSON.parse(result.content)).toMatchSnapshot();
    expect(result.parsed).toMatchSnapshot();
  });
  it("should support structured prediction with GBNF grammar", async () => {
    const gbnfGrammar = `
      ans ::= "2" | "random"
      root ::= "Oh no, I am possessed! And 1 + 1 is " ans
    `;
    const result = await model.respond("Are you possessed?", {
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

    // Assistant message 2
    //   ---      --
    //  Start    End
    const result = await model.respond(chat, {
      temperature: 0,
      maxTokens: 20,
      stopStrings: ["9"],
      reasoningParsing: { enabled: true, startString: "sis", endString: "es" },
      onPredictionFragment: fragment => {
        fragmentsWithReasoningType.push({
          content: fragment.content,
          reasoningType: fragment.reasoningType,
        });
      },
    });
    expect(result.content).toMatchInlineSnapshot(`"Assistant message 2"`);
    expect(result.reasoningContent).toMatchInlineSnapshot(`"tant m"`);
    expect(result.nonReasoningContent).toMatchInlineSnapshot(`"Assage 2"`);
    expect(fragmentsWithReasoningType).toMatchSnapshot();
  });
});
