import { Chat, LMStudioClient, type LLM } from "../index.js";
import {
  ensureHeavyTestsEnvironment,
  llmTestingQwen05B,
  llmTestingQwen3B,
} from "../shared.heavy.test.js";

describe("LLM + speculative decoding", () => {
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
    model = await client.llm.model(llmTestingQwen3B, {
      verbose: false,
      config: {
        llamaKCacheQuantizationType: "f32",
        llamaVCacheQuantizationType: "f32",
      },
    });
  }, 60_000);
  it("should work with .respond", async () => {
    const result = await model.respond(chat, {
      temperature: 0,
      draftModel: llmTestingQwen05B,
    });
    expect(result.content).toMatchSnapshot();
    expect(result.stats).toMatchSnapshot({
      numGpuLayers: expect.any(Number),
      timeToFirstTokenSec: expect.any(Number),
      tokensPerSecond: expect.any(Number),
      totalTimeSec: expect.any(Number),
      usedDraftModelKey: expect.any(String),
    });
    expect(result.modelInfo).toMatchSnapshot({
      identifier: expect.any(String),
      instanceReference: expect.any(String),
      modelKey: expect.any(String),
    });
    expect(result.roundIndex).toEqual(0);
  });
  it("should work with .complete", async () => {
    const result = await model.complete("1 + 1 = 2; 2 + 2 = ", {
      temperature: 0,
      maxTokens: 5,
      stopStrings: ["+"],
      draftModel: llmTestingQwen05B,
    });
    expect(result.content).toMatchInlineSnapshot(`"4; 3"`);
    expect(result.stats).toMatchSnapshot({
      numGpuLayers: expect.any(Number),
      timeToFirstTokenSec: expect.any(Number),
      tokensPerSecond: expect.any(Number),
      totalTimeSec: expect.any(Number),
      usedDraftModelKey: expect.any(String),
    });
    expect(result.modelInfo).toMatchSnapshot({
      identifier: expect.any(String),
      instanceReference: expect.any(String),
      modelKey: expect.any(String),
    });
    expect(result.roundIndex).toEqual(0);
  });
  it("should fail with invalid model", async () => {
    await expect(async () => {
      await model.complete("1 + 1 = 2; 2 + 2 = ", {
        draftModel: "invalid-model",
      });
    }).rejects.toThrow('Cannot find model "invalid-model"');
  });
});
