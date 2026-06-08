import { Chat, type LLM, LMStudioClient } from "../index.js";
import { ensureHeavyTestsEnvironment, llmTestingQwen05B } from "../shared.heavy.test.js";

describe("LLM", () => {
  let client: LMStudioClient;
  const chat = Chat.from([
    { role: "system", content: "This is the system prompt." },
    { role: "user", content: "User message 1" },
    { role: "assistant", content: "Assistant message 1" },
    { role: "user", content: "User message 2" },
  ]);
  const defaultLoadConfig = {
    llamaKCacheQuantizationType: "f32" as const,
    llamaVCacheQuantizationType: "f32" as const,
  };
  beforeAll(async () => {
    client = new LMStudioClient();
    await ensureHeavyTestsEnvironment(client);
  });
  describe("with default model fixture", () => {
    let model: LLM;

    beforeEach(async () => {
      model = await client.llm.model(llmTestingQwen05B, {
        verbose: false,
        config: defaultLoadConfig,
      });
    }, 60_000);
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
    it("Can tokenize multiple strings correctly", async () => {
      const tokens = await model.tokenize([
        "Cersei understands the consequences of her absence",
        "and she is absent anyway",
      ]);
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

  describe("load config round-trips", () => {
    it("does not surface fit-ignored GPU defaults from getLoadConfig()", async () => {
      let fitEnabledModel: LLM | undefined;
      try {
        fitEnabledModel = await client.llm.model(llmTestingQwen05B, {
          verbose: false,
          config: defaultLoadConfig,
        });

        const fitEnabledLoadConfig = await fitEnabledModel.getLoadConfig();

        expect(fitEnabledLoadConfig.fit).toBe(true);
        expect(fitEnabledLoadConfig.gpu).toBeUndefined();
      } finally {
        if (fitEnabledModel !== undefined) {
          await fitEnabledModel.unload();
        }
      }
    }, 60_000);
    it("preserves fit=true through getLoadConfig() to load() round-trip", async () => {
      let firstModel: LLM | undefined;
      let roundTripModel: LLM | undefined;
      try {
        firstModel = await client.llm.model(llmTestingQwen05B, {
          verbose: false,
          config: defaultLoadConfig,
        });

        const firstLoadConfig = await firstModel.getLoadConfig();

        expect(firstLoadConfig.fit).toBe(true);
        expect(firstLoadConfig.gpu).toBeUndefined();

        roundTripModel = await client.llm.load(llmTestingQwen05B, {
          identifier: `fit-roundtrip-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`,
          verbose: false,
          config: firstLoadConfig,
        });

        const secondLoadConfig = await roundTripModel.getLoadConfig();

        expect(secondLoadConfig.fit).toBe(true);
        expect(secondLoadConfig.gpu).toBeUndefined();
      } finally {
        if (roundTripModel !== undefined) {
          await roundTripModel.unload();
        }
        if (firstModel !== undefined) {
          await firstModel.unload();
        }
      }
    }, 60_000);
    it("preserves fit=false through getLoadConfig() to load() round-trip", async () => {
      let firstManualModel: LLM | undefined;
      let secondManualModel: LLM | undefined;
      try {
        firstManualModel = await client.llm.load(llmTestingQwen05B, {
          identifier: `fit-disabled-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`,
          verbose: false,
          config: {
            fit: false,
            gpu: { ratio: "off" },
            ...defaultLoadConfig,
          },
        });

        const firstLoadConfig = await firstManualModel.getLoadConfig();

        expect(firstLoadConfig.fit).toBe(false);
        expect(firstLoadConfig.gpu?.ratio).toBe("off");

        secondManualModel = await client.llm.load(llmTestingQwen05B, {
          identifier: `fit-disabled-roundtrip-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`,
          verbose: false,
          config: firstLoadConfig,
        });

        const secondLoadConfig = await secondManualModel.getLoadConfig();

        expect(secondLoadConfig.fit).toBe(false);
        expect(secondLoadConfig.gpu?.ratio).toBe("off");
      } finally {
        if (secondManualModel !== undefined) {
          await secondManualModel.unload();
        }
        if (firstManualModel !== undefined) {
          await firstManualModel.unload();
        }
      }
    }, 60_000);
  });
});
