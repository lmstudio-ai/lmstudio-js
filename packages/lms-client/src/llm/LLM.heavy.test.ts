import { Chat, type LLM, LMStudioClient } from "../index.js";
import { ensureHeavyTestsEnvironment, llmTestingQwen05B } from "../shared.heavy.test.js";

describe("LLM", () => {
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
    model = await client.llm.model(llmTestingQwen05B, { verbose: false });
  });
  it("can apply prompt template to a regular chat", async () => {
    const formatted = await model.applyPromptTemplate(chat);
    expect(formatted).toMatchSnapshot();
  });
  it("can get model context length", async () => {
    const contextLength = await model.getContextLength();
    expect(contextLength).toMatchInlineSnapshot(`4096`);
  });
  it("can get model info", async () => {
    const modelInfo = await model.getModelInfo();
    expect(modelInfo).toMatchSnapshot({
      identifier: expect.any(String),
      instanceReference: expect.any(String),
      modelKey: expect.any(String),
    });
  });
  it("Can tokenize correctly", async () => {
    const tokens = await model.tokenize("Chaos is a ladder.");
    expect(tokens).toMatchSnapshot();
  });
  it("Can count tokens correctly", async () => {
    const count = await model.countTokens("Chaos is a ladder.");
    expect(count).toMatchInlineSnapshot(`6`);
  });
  it("Has correct properties", async () => {
    expect(model.displayName).toMatchInlineSnapshot(`"Qwen2.5 0.5B Instruct"`);
    expect(model.format).toMatchInlineSnapshot(`"gguf"`);
    expect(model.identifier).toEqual(llmTestingQwen05B);
    expect(model.path).toEqual(llmTestingQwen05B);
    expect(model.sizeBytes).toMatchInlineSnapshot(`397807936`);
    expect(model.trainedForToolUse).toMatchInlineSnapshot(`true`);
    expect(model.vision).toMatchInlineSnapshot(`false`);
  });
});
