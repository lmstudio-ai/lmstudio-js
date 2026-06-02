import { kvConfigField, KVConfigSchematicsBuilder, makeKVConfigFromFields } from "./KVConfig.js";
import {
  llmLoadModelConfigSchema,
  llmLoadSpeculativeDecodingStrategySchema,
  normalizeLLMLoadSpeculativeDecodingConfig,
} from "@lmstudio/lms-shared-types";
import {
  kvConfigToLLMLoadModelConfig,
  llmLoadModelConfigToKVConfig,
} from "./conversion/llmLoadModelConfig.js";
import { globalConfigSchematics } from "./schema.js";
import { kvValueTypesLibrary } from "./valueTypes.js";

describe("KVConfig", () => {
  describe("union", () => {
    it("should work with root level schematics", () => {
      const schematics1 = new KVConfigSchematicsBuilder(kvValueTypesLibrary)
        .field("a", "numeric", {}, 0)
        .build();
      const schematics2 = new KVConfigSchematicsBuilder(kvValueTypesLibrary)
        .field("b", "numeric", {}, 0)
        .build();
      const union = schematics1.union(schematics2);
      const kvConfig = makeKVConfigFromFields([kvConfigField("a", 1), kvConfigField("b", 2)]);
      const parsed = union.parse(kvConfig);
      expect(parsed.get("a")).toBe(1);
      expect(parsed.get("b")).toBe(2);
    });
    it("should work with nested level schematics", () => {
      const schematics1 = new KVConfigSchematicsBuilder(kvValueTypesLibrary)
        .scope("nested", builder => builder.field("a", "numeric", {}, 0))
        .build();
      const schematics2 = new KVConfigSchematicsBuilder(kvValueTypesLibrary)
        .field("b", "numeric", {}, 0)
        .build();
      const union = schematics1.union(schematics2);
      const kvConfig = makeKVConfigFromFields([
        kvConfigField("nested.a", 1),
        kvConfigField("b", 2),
      ]);
      const parsed = union.parse(kvConfig);
      expect(parsed.get("nested.a")).toBe(1);
      expect(parsed.get("b")).toBe(2);
    });
    it("should work with scoped schematics", () => {
      const schematics1 = new KVConfigSchematicsBuilder(kvValueTypesLibrary)
        .scope("nested", builder => builder.field("a", "numeric", {}, 0))
        .build();
      const schematics2 = new KVConfigSchematicsBuilder(kvValueTypesLibrary)
        .field("b", "numeric", {}, 0)
        .build();
      const union = schematics1.scoped("nested").union(schematics2);
      const kvConfig = makeKVConfigFromFields([
        kvConfigField("nested.a", 1),
        kvConfigField("b", 2),
      ]);
      const parsed = union.parse(kvConfig);
      expect(parsed.get("a")).toBe(1);
      expect(parsed.get("b")).toBe(2);
    });
  });
});

describe("llmLoadModelConfig conversion", () => {
  it("preserves unspecified speculative decoding load config", () => {
    const loadConfig = llmLoadModelConfigToKVConfig({});

    const roundTrippedConfig = kvConfigToLLMLoadModelConfig(loadConfig);

    expect(roundTrippedConfig.speculativeDecoding).toBeUndefined();
  });

  it("round trips disabled speculative decoding load config", () => {
    const loadConfig = llmLoadModelConfigToKVConfig({
      speculativeDecoding: [],
    });

    const roundTrippedConfig = kvConfigToLLMLoadModelConfig(loadConfig);

    expect(roundTrippedConfig.speculativeDecoding).toEqual([]);
  });

  it("round trips draft-model load-time speculative decoding", () => {
    const loadConfig = llmLoadModelConfigToKVConfig({
      speculativeDecoding: [
        {
          type: "draftModel",
          draftModel: "publisher/draft-model",
          maxTokensToDraft: 16,
          minDraftLengthToConsider: 0,
          minContinueDraftingProbability: 0.75,
        },
      ],
    });

    const roundTrippedConfig = kvConfigToLLMLoadModelConfig(loadConfig);

    expect(roundTrippedConfig.speculativeDecoding).toEqual([
      {
        type: "draftModel",
        draftModel: "publisher/draft-model",
        maxTokensToDraft: 16,
        minDraftLengthToConsider: 0,
        minContinueDraftingProbability: 0.75,
      },
    ]);
  });

  it("round trips MTP load-time draft token settings", () => {
    const loadConfig = llmLoadModelConfigToKVConfig({
      speculativeDraftMtp: true,
      speculativeDraftMtpMaxTokens: 2,
      speculativeDraftMtpMinTokens: 0,
    });

    const roundTrippedConfig = kvConfigToLLMLoadModelConfig(loadConfig);

    expect(roundTrippedConfig.speculativeDraftMtp).toBe(true);
    expect(roundTrippedConfig.speculativeDraftMtpMaxTokens).toBe(2);
    expect(roundTrippedConfig.speculativeDraftMtpMinTokens).toBe(0);
    expect(roundTrippedConfig.speculativeDecoding).toEqual([
      {
        type: "draftMtp",
        maxTokensToDraft: 2,
        minDraftLengthToConsider: 0,
      },
    ]);
  });

  it("normalizes legacy MTP load fields to the canonical strategy list", () => {
    const canonicalConfig = normalizeLLMLoadSpeculativeDecodingConfig({
      speculativeDecoding: [
        {
          type: "draftMtp",
          maxTokensToDraft: 2,
          minDraftLengthToConsider: 0,
        },
      ],
    });
    const legacyConfig = normalizeLLMLoadSpeculativeDecodingConfig({
      speculativeDraftMtp: true,
      speculativeDraftMtpMaxTokens: 2,
      speculativeDraftMtpMinTokens: 0,
    });

    expect(legacyConfig).toEqual(canonicalConfig);
  });

  it("preserves numeric-only legacy MTP fields without enabling speculative decoding", () => {
    const normalizedConfig = normalizeLLMLoadSpeculativeDecodingConfig({
      speculativeDraftMtpMaxTokens: 2,
      speculativeDraftMtpMinTokens: 0,
    });

    expect(normalizedConfig).toBeUndefined();
  });

  it("rejects conflicting canonical and legacy MTP load config", () => {
    expect(() =>
      normalizeLLMLoadSpeculativeDecodingConfig({
        speculativeDecoding: [],
        speculativeDraftMtp: true,
      }),
    ).toThrow("speculativeDecoding conflicts with deprecated speculativeDraftMtp load fields");

    expect(
      llmLoadModelConfigSchema.safeParse({
        speculativeDecoding: [],
        speculativeDraftMtp: true,
      }).success,
    ).toBe(false);
  });

  it("rejects invalid speculative decoding strategy values", () => {
    expect(
      llmLoadModelConfigSchema.safeParse({
        speculativeDecoding: [
          {
            type: "draftModel",
            draftModel: "publisher/draft-model",
            maxTokensToDraft: 1,
            minDraftLengthToConsider: 2,
          },
        ],
      }).success,
    ).toBe(false);

    expect(
      llmLoadModelConfigSchema.safeParse({
        speculativeDecoding: [
          {
            type: "draftModel",
            draftModel: "publisher/draft-model",
            minContinueDraftingProbability: 1.5,
          },
        ],
      }).success,
    ).toBe(false);

    expect(
      llmLoadModelConfigSchema.safeParse({
        speculativeDecoding: [
          {
            type: "draftMtp",
          },
          {
            type: "draftModel",
            draftModel: "publisher/draft-model",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects unknown speculative decoding strategy types", () => {
    expect(
      llmLoadSpeculativeDecodingStrategySchema.safeParse({
        type: "unsupportedStrategy",
      }).success,
    ).toBe(false);
  });

  it("round trips llama physical batch size", () => {
    const loadConfig = llmLoadModelConfigToKVConfig({
      evalBatchSize: 512,
      physicalBatchSize: 256,
    });

    const roundTrippedConfig = kvConfigToLLMLoadModelConfig(loadConfig);

    expect(roundTrippedConfig.evalBatchSize).toBe(512);
    expect(roundTrippedConfig.physicalBatchSize).toBe(256);
  });

  it("does not expose llama physical batch size for MLX load configs", () => {
    const loadConfig = llmLoadModelConfigToKVConfig({
      physicalBatchSize: 256,
    });

    const roundTrippedConfig = kvConfigToLLMLoadModelConfig(loadConfig, {
      modelFormat: "safetensors",
    });

    expect(roundTrippedConfig.physicalBatchSize).toBeUndefined();
  });
});

describe("globalConfigSchematics", () => {
  it("uses 2048 as the default llama eval batch size", () => {
    const emptyConfig = makeKVConfigFromFields([]);

    expect(globalConfigSchematics.access(emptyConfig, "llm.load.llama.evalBatchSize")).toBe(2048);
    expect(globalConfigSchematics.access(emptyConfig, "embedding.load.llama.evalBatchSize")).toBe(
      2048,
    );
  });

  it("makes speculative decoding draft-token settings depend on a draft model", () => {
    const dependentConfigKeys = [
      "llm.prediction.speculativeDecoding.minDraftLengthToConsider",
      "llm.prediction.speculativeDecoding.numReuseTokens",
      "llm.prediction.speculativeDecoding.minContinueDraftingProbability",
      "llm.prediction.speculativeDecoding.maxTokensToDraft",
      "llm.prediction.speculativeDecoding.numDraftTokensExact",
    ];

    for (const configKey of dependentConfigKeys) {
      expect(globalConfigSchematics.getValueTypeParamByFullKey(configKey).dependencies).toEqual([
        {
          key: "llm.prediction.speculativeDecoding.draftModel",
          condition: { type: "notEquals", value: "" },
        },
      ]);
    }
  });

  describe("effectiveEquals", () => {
    it("should work with temperature", () => {
      expect(globalConfigSchematics.fieldEffectiveEquals("llm.prediction.temperature", 0, 0)).toBe(
        true,
      );
      expect(globalConfigSchematics.fieldEffectiveEquals("llm.prediction.temperature", 0, 1)).toBe(
        false,
      );
    });
    it("should work with repeat penalty", () => {
      expect(
        globalConfigSchematics.fieldEffectiveEquals(
          "llm.prediction.repeatPenalty",
          { checked: true, value: 0 },
          { checked: true, value: 0 },
        ),
      ).toBe(true);
      expect(
        globalConfigSchematics.fieldEffectiveEquals(
          "llm.prediction.repeatPenalty",
          { checked: true, value: 0 },
          { checked: true, value: 1 },
        ),
      ).toBe(false);
      expect(
        globalConfigSchematics.fieldEffectiveEquals(
          "llm.prediction.repeatPenalty",
          { checked: true, value: 0 },
          { checked: false, value: 0 },
        ),
      ).toBe(false);
      expect(
        globalConfigSchematics.fieldEffectiveEquals(
          "llm.prediction.repeatPenalty",
          { checked: false, value: 0 },
          { checked: false, value: 1 },
        ),
      ).toBe(true);
    });
    it("should work with presence penalty", () => {
      expect(
        globalConfigSchematics.fieldEffectiveEquals(
          "llm.prediction.llama.presencePenalty",
          { checked: true, value: 0 },
          { checked: true, value: 0 },
        ),
      ).toBe(true);
      expect(
        globalConfigSchematics.fieldEffectiveEquals(
          "llm.prediction.llama.presencePenalty",
          { checked: true, value: 0 },
          { checked: true, value: 1 },
        ),
      ).toBe(false);
      expect(
        globalConfigSchematics.fieldEffectiveEquals(
          "llm.prediction.llama.presencePenalty",
          { checked: true, value: 0 },
          { checked: false, value: 0 },
        ),
      ).toBe(false);
      expect(
        globalConfigSchematics.fieldEffectiveEquals(
          "llm.prediction.llama.presencePenalty",
          { checked: false, value: 0 },
          { checked: false, value: 1 },
        ),
      ).toBe(true);
    });
  });
  describe("stringify", () => {
    it("should work with temperature", () => {
      expect(globalConfigSchematics.stringifyField("llm.prediction.temperature", 0)).toBe("0.00");
      expect(globalConfigSchematics.stringifyField("llm.prediction.temperature", 0.5)).toBe("0.50");
    });
    it("should work with repeat penalty", () => {
      expect(
        globalConfigSchematics.stringifyField("llm.prediction.repeatPenalty", {
          checked: true,
          value: 0,
        }),
      ).toBe("0.00");
      expect(
        globalConfigSchematics.stringifyField("llm.prediction.repeatPenalty", {
          checked: true,
          value: 0.5,
        }),
      ).toBe("0.50");
      expect(
        globalConfigSchematics.stringifyField("llm.prediction.repeatPenalty", {
          checked: false,
          value: 0.5,
        }),
      ).toBe("OFF");

      const translateFn = jest.fn(() => "TEST");
      expect(
        globalConfigSchematics.stringifyField(
          "llm.prediction.repeatPenalty",
          {
            checked: false,
            value: 0.5,
          },
          {
            t: translateFn,
          },
        ),
      ).toBe("TEST");
      expect(translateFn).toHaveBeenCalledTimes(1);
      expect(translateFn).toHaveBeenCalledWith("config:customInputs.checkboxNumeric.off", "OFF");
    });
    it("should work with presence penalty", () => {
      expect(
        globalConfigSchematics.stringifyField("llm.prediction.llama.presencePenalty", {
          checked: true,
          value: 0,
        }),
      ).toBe("0.00");
      expect(
        globalConfigSchematics.stringifyField("llm.prediction.llama.presencePenalty", {
          checked: true,
          value: 0.5,
        }),
      ).toBe("0.50");
      expect(
        globalConfigSchematics.stringifyField("llm.prediction.llama.presencePenalty", {
          checked: false,
          value: 0.5,
        }),
      ).toBe("OFF");

      const translateFn = jest.fn(() => "TEST");
      expect(
        globalConfigSchematics.stringifyField(
          "llm.prediction.llama.presencePenalty",
          {
            checked: false,
            value: 0.5,
          },
          {
            t: translateFn,
          },
        ),
      ).toBe("TEST");
      expect(translateFn).toHaveBeenCalledTimes(1);
      expect(translateFn).toHaveBeenCalledWith("config:customInputs.checkboxNumeric.off", "OFF");
    });
  });
});
