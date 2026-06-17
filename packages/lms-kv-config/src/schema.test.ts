import {
  llmLoadModelConfigSchema,
  serializedKVConfigSchematicsSchema,
} from "@lmstudio/lms-shared-types";
import {
  kvConfigField,
  KVConfigSchematics,
  KVConfigSchematicsBuilder,
  makeKVConfigFromFields,
} from "./KVConfig.js";
import {
  kvConfigToLLMLoadModelConfig,
  llmLoadModelConfigToKVConfig,
} from "./conversion/llmLoadModelConfig.js";
import {
  defaultLlmLoadPromptTemplate,
  globalConfigSchematics,
  llmLlamaLoadConfigSchematics,
  llmLoadSchematics,
  llmMlxLoadConfigSchematics,
} from "./schema.js";
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
  it("round trips load-time prompt template config", () => {
    const promptTemplate = {
      type: "jinja" as const,
      jinjaPromptTemplate: {
        template: "{% for message in messages %}{{ message.content }}{% endfor %}",
      },
    };
    const loadConfig = llmLoadModelConfigToKVConfig({
      promptTemplate,
    });

    const roundTrippedConfig = kvConfigToLLMLoadModelConfig(loadConfig);

    expect(roundTrippedConfig.promptTemplate).toEqual(promptTemplate);
  });

  it("keeps absent load-time prompt template absent even with load defaults", () => {
    const emptyConfig = makeKVConfigFromFields([]);

    const partialConfig = kvConfigToLLMLoadModelConfig(emptyConfig);
    const defaultedConfig = kvConfigToLLMLoadModelConfig(emptyConfig, {
      useDefaultsForMissingKeys: true,
    });

    expect(partialConfig.promptTemplate).toBeUndefined();
    expect(defaultedConfig.promptTemplate).toBeUndefined();
  });

  it("keeps absent raw load-time prompt template absent even with a concrete schema default", () => {
    const emptyConfig = makeKVConfigFromFields([]);
    const defaultedConfig = kvConfigToLLMLoadModelConfig(emptyConfig, {
      useDefaultsForMissingKeys: true,
    });

    expect(defaultedConfig.promptTemplate).toBeUndefined();
    expect(globalConfigSchematics.access(emptyConfig, "llm.load.promptTemplate")).toEqual(
      defaultLlmLoadPromptTemplate,
    );
  });

  it("preserves unspecified speculative decoding load config", () => {
    const loadConfig = llmLoadModelConfigToKVConfig({});

    const roundTrippedConfig = kvConfigToLLMLoadModelConfig(loadConfig);

    expect(roundTrippedConfig.speculativeDraftMtp).toBeUndefined();
    expect(roundTrippedConfig.speculativeDraftSimple).toBeUndefined();
    expect(roundTrippedConfig.speculativeDraftModel).toBeUndefined();
    expect(roundTrippedConfig.speculativeDraftMaxTokens).toBeUndefined();
    expect(roundTrippedConfig.speculativeDraftMinTokens).toBeUndefined();
    expect(roundTrippedConfig.speculativeDraftMinContinueProbability).toBeUndefined();
  });

  it("round trips explicit Draft MTP off", () => {
    const loadConfig = llmLoadModelConfigToKVConfig({
      speculativeDraftMtp: false,
    });

    const roundTrippedConfig = kvConfigToLLMLoadModelConfig(loadConfig);

    expect(roundTrippedConfig.speculativeDraftMtp).toBe(false);
  });

  it("round trips Draft MTP load-time speculative decoding", () => {
    const loadConfig = llmLoadModelConfigToKVConfig({
      speculativeDraftMtp: true,
      speculativeDraftMaxTokens: 2,
      speculativeDraftMinTokens: 0,
    });

    const roundTrippedConfig = kvConfigToLLMLoadModelConfig(loadConfig);

    expect(roundTrippedConfig.speculativeDraftMtp).toBe(true);
    expect(roundTrippedConfig.speculativeDraftMaxTokens).toBe(2);
    expect(roundTrippedConfig.speculativeDraftMinTokens).toBe(0);
  });

  it("round trips Draft Model load-time speculative decoding", () => {
    const loadConfig = llmLoadModelConfigToKVConfig({
      speculativeDraftMtp: false,
      speculativeDraftSimple: true,
      speculativeDraftModel: "publisher/draft-model",
      speculativeDraftMaxTokens: 16,
      speculativeDraftMinTokens: 0,
      speculativeDraftMinContinueProbability: 0.75,
    });

    const roundTrippedConfig = kvConfigToLLMLoadModelConfig(loadConfig);

    expect(roundTrippedConfig.speculativeDraftMtp).toBe(false);
    expect(roundTrippedConfig.speculativeDraftSimple).toBe(true);
    expect(roundTrippedConfig.speculativeDraftModel).toBe("publisher/draft-model");
    expect(roundTrippedConfig.speculativeDraftMaxTokens).toBe(16);
    expect(roundTrippedConfig.speculativeDraftMinTokens).toBe(0);
    expect(roundTrippedConfig.speculativeDraftMinContinueProbability).toBe(0.75);
  });

  it("keeps undefined and false Draft MTP distinct", () => {
    const unspecifiedLoadConfig = llmLoadModelConfigToKVConfig({});
    const disabledLoadConfig = llmLoadModelConfigToKVConfig({
      speculativeDraftMtp: false,
    });

    const unspecifiedRoundTrip = kvConfigToLLMLoadModelConfig(unspecifiedLoadConfig);
    const disabledRoundTrip = kvConfigToLLMLoadModelConfig(disabledLoadConfig);

    expect(unspecifiedRoundTrip.speculativeDraftMtp).toBeUndefined();
    expect(disabledRoundTrip.speculativeDraftMtp).toBe(false);
  });

  it("uses shared draft tuning defaults when defaults are requested", () => {
    const loadConfig = globalConfigSchematics.scoped("llm.load").buildPartialConfig({
      "llama.speculativeDecoding.draftMtp": true,
    });

    const convertedConfig = kvConfigToLLMLoadModelConfig(loadConfig, {
      useDefaultsForMissingKeys: true,
    });

    expect(convertedConfig.speculativeDraftMtp).toBe(true);
    expect(convertedConfig.speculativeDraftSimple).toBe(false);
    expect(convertedConfig.speculativeDraftModel).toBe("");
    expect(convertedConfig.speculativeDraftMaxTokens).toBe(16);
    expect(convertedConfig.speculativeDraftMinTokens).toBe(0);
    expect(convertedConfig.speculativeDraftMinContinueProbability).toBe(0.75);
  });

  it("materializes empty default Draft Model when defaults are requested", () => {
    const convertedConfig = kvConfigToLLMLoadModelConfig(makeKVConfigFromFields([]), {
      useDefaultsForMissingKeys: true,
    });

    expect(convertedConfig.speculativeDraftMtp).toBe(false);
    expect(convertedConfig.speculativeDraftSimple).toBe(false);
    expect(convertedConfig.speculativeDraftModel).toBe("");
  });

  it("normalizes inert materialized Draft Model resources for public round trips", () => {
    const loadConfig = globalConfigSchematics.scoped("llm.load").buildPartialConfig({
      "llama.speculativeDecoding.draftMtp": false,
      "llama.speculativeDecoding.draftSimple": false,
      "llama.speculativeDecoding.draftModel": "publisher/stale-draft-model",
    });

    const convertedConfig = kvConfigToLLMLoadModelConfig(loadConfig, {
      useDefaultsForMissingKeys: true,
    });

    expect(convertedConfig.speculativeDraftMtp).toBe(false);
    expect(convertedConfig.speculativeDraftSimple).toBe(false);
    expect(convertedConfig.speculativeDraftModel).toBe("");
    expect(llmLoadModelConfigSchema.safeParse(convertedConfig).success).toBe(true);
  });

  it("preserves materialized Draft Model resources when Draft Simple is active", () => {
    const loadConfig = globalConfigSchematics.scoped("llm.load").buildPartialConfig({
      "llama.speculativeDecoding.draftMtp": false,
      "llama.speculativeDecoding.draftSimple": true,
      "llama.speculativeDecoding.draftModel": "publisher/draft-model",
    });

    const convertedConfig = kvConfigToLLMLoadModelConfig(loadConfig, {
      useDefaultsForMissingKeys: true,
    });

    expect(convertedConfig.speculativeDraftMtp).toBe(false);
    expect(convertedConfig.speculativeDraftSimple).toBe(true);
    expect(convertedConfig.speculativeDraftModel).toBe("publisher/draft-model");
    expect(llmLoadModelConfigSchema.safeParse(convertedConfig).success).toBe(true);
  });

  it("preserves an explicitly empty Draft Model from KV config", () => {
    const loadConfig = globalConfigSchematics.scoped("llm.load").buildPartialConfig({
      "llama.speculativeDecoding.draftModel": "",
    });

    const convertedConfig = kvConfigToLLMLoadModelConfig(loadConfig);

    expect(convertedConfig.speculativeDraftModel).toBe("");
  });

  it("preserves orphan draft tuning fields without enabling speculative decoding", () => {
    const loadConfig = globalConfigSchematics.scoped("llm.load").buildPartialConfig({
      "llama.speculativeDecoding.draftMaxTokens": 8,
      "llama.speculativeDecoding.draftMinTokens": 2,
      "llama.speculativeDecoding.draftMinContinueProbability": 0.5,
    });

    const convertedConfig = kvConfigToLLMLoadModelConfig(loadConfig);

    expect(convertedConfig.speculativeDraftMtp).toBeUndefined();
    expect(convertedConfig.speculativeDraftSimple).toBeUndefined();
    expect(convertedConfig.speculativeDraftModel).toBeUndefined();
    expect(convertedConfig.speculativeDraftMaxTokens).toBe(8);
    expect(convertedConfig.speculativeDraftMinTokens).toBe(2);
    expect(convertedConfig.speculativeDraftMinContinueProbability).toBe(0.5);
  });

  it("ignores beta Draft MTP token limit keys", () => {
    const loadConfig = makeKVConfigFromFields([
      kvConfigField("llm.load.llama.speculativeDecoding.draftMtpMaxTokens", 8),
      kvConfigField("llm.load.llama.speculativeDecoding.draftMtpMinTokens", 2),
    ]);

    const convertedConfig = kvConfigToLLMLoadModelConfig(loadConfig);

    expect(convertedConfig.speculativeDraftMaxTokens).toBeUndefined();
    expect(convertedConfig.speculativeDraftMinTokens).toBeUndefined();
  });

  it("writes only V2 shared draft token limits", () => {
    const loadConfig = llmLoadModelConfigToKVConfig({
      speculativeDraftMaxTokens: 8,
      speculativeDraftMinTokens: 2,
    });

    const fieldKeys = loadConfig.fields.map(field => field.key);

    expect(fieldKeys).toContain("llm.load.llama.speculativeDecoding.draftMaxTokens");
    expect(fieldKeys).toContain("llm.load.llama.speculativeDecoding.draftMinTokens");
    expect(fieldKeys).not.toContain("llm.load.llama.speculativeDecoding.draftMtpMaxTokens");
    expect(fieldKeys).not.toContain("llm.load.llama.speculativeDecoding.draftMtpMinTokens");
  });

  it("rejects invalid V2 flat speculative decoding values", () => {
    expect(
      llmLoadModelConfigSchema.safeParse({
        speculativeDraftModel: "publisher/draft-model",
      }).success,
    ).toBe(false);

    expect(
      llmLoadModelConfigSchema.safeParse({
        speculativeDraftSimple: true,
        speculativeDraftModel: "",
      }).success,
    ).toBe(false);

    expect(
      llmLoadModelConfigSchema.safeParse({
        speculativeDraftSimple: true,
        speculativeDraftModel: "publisher/draft-model",
        speculativeDraftMaxTokens: 1,
        speculativeDraftMinTokens: 2,
      }).success,
    ).toBe(false);

    expect(
      llmLoadModelConfigSchema.safeParse({
        speculativeDraftSimple: true,
        speculativeDraftModel: "publisher/draft-model",
        speculativeDraftMinContinueProbability: 1.5,
      }).success,
    ).toBe(false);

    expect(
      llmLoadModelConfigSchema.safeParse({
        speculativeDraftMtp: true,
        speculativeDraftSimple: true,
        speculativeDraftModel: "publisher/draft-model",
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
  it("accepts load-time Jinja prompt template", () => {
    const promptTemplate = {
      type: "jinja" as const,
      jinjaPromptTemplate: {
        template: "{% for message in messages %}{{ message.content }}{% endfor %}",
      },
    };
    const loadConfig = llmLoadSchematics.buildPartialConfig({
      promptTemplate,
    });

    expect(globalConfigSchematics.access(loadConfig, "llm.load.promptTemplate")).toEqual(
      promptTemplate,
    );
  });

  it("ignores beta load-time prompt template stop strings", () => {
    const promptTemplate = {
      type: "jinja" as const,
      jinjaPromptTemplate: {
        template: "{% for message in messages %}{{ message.content }}{% endfor %}",
      },
    };
    const loadConfig = makeKVConfigFromFields([
      kvConfigField("llm.load.promptTemplate", {
        ...promptTemplate,
        stopStrings: ["<beta-stop>"],
      }),
    ]);

    expect(globalConfigSchematics.access(loadConfig, "llm.load.promptTemplate")).toEqual(
      promptTemplate,
    );
  });

  it("rejects undefined as a load-time prompt template stored value", () => {
    expect(llmLoadSchematics.getSchemaForKey("promptTemplate").safeParse(undefined).success).toBe(
      false,
    );
  });

  it("materializes the concrete load-time prompt template schema default", () => {
    const fullConfig = llmLoadSchematics.buildFullConfig({});

    expect(llmLoadSchematics.access(fullConfig, "promptTemplate")).toEqual(
      defaultLlmLoadPromptTemplate,
    );
  });

  it("omits undefined prompt template values from partial load configs", () => {
    const partialConfig = llmLoadSchematics.buildPartialConfig({
      promptTemplate: undefined,
    });

    expect(partialConfig.fields.some(field => field.key === "llm.load.promptTemplate")).toBe(false);
  });

  it("serializes load-time prompt template schema default as concrete Jinja", () => {
    const serializedSchematics = llmLoadSchematics.serialize();
    const promptTemplateField = serializedSchematics.fields.find(
      field => field.fullKey === "llm.load.promptTemplate",
    );

    expect(promptTemplateField?.defaultValue).toEqual(defaultLlmLoadPromptTemplate);
    expect(promptTemplateField?.typeParams.isExperimental).toBeUndefined();
    expect(() => serializedKVConfigSchematicsSchema.parse(serializedSchematics)).not.toThrow();

    const deserializedSchematics = KVConfigSchematics.deserialize(
      kvValueTypesLibrary,
      serializedSchematics,
    );
    const emptyConfig = makeKVConfigFromFields([]);

    expect(deserializedSchematics.obtainField("promptTemplate").defaultValue).toEqual(
      defaultLlmLoadPromptTemplate,
    );
    expect(deserializedSchematics.access(emptyConfig, "promptTemplate")).toEqual(
      defaultLlmLoadPromptTemplate,
    );
    expect(deserializedSchematics.accessPartial(emptyConfig, "promptTemplate")).toBeUndefined();
  });

  it("keeps concrete load-time prompt template defaults serializable", () => {
    const promptTemplate = {
      type: "jinja" as const,
      jinjaPromptTemplate: {
        template: "{% for message in messages %}{{ message.content }}{% endfor %}",
      },
    };
    const schematics = new KVConfigSchematicsBuilder(kvValueTypesLibrary)
      .field("promptTemplate", "llmLoadPromptTemplate", {}, promptTemplate)
      .build();
    const serializedSchematics = schematics.serialize();

    expect(serializedSchematics.fields[0]?.defaultValue).toEqual(promptTemplate);
    expect(() => serializedKVConfigSchematicsSchema.parse(serializedSchematics)).not.toThrow();

    const deserializedSchematics = KVConfigSchematics.deserialize(
      kvValueTypesLibrary,
      serializedSchematics,
    );

    expect(deserializedSchematics.access(makeKVConfigFromFields([]), "promptTemplate")).toEqual(
      promptTemplate,
    );
  });

  it("does not expose null as a public load-time prompt template value", () => {
    expect(() =>
      llmLoadModelConfigSchema.parse({
        promptTemplate: null,
      }),
    ).toThrow();
  });

  it("includes load-time prompt template in llama load schematics but not MLX load schematics", () => {
    expect(llmLlamaLoadConfigSchematics.obtainField("promptTemplate").fullKey).toBe(
      "llm.load.promptTemplate",
    );
    expect(() => llmMlxLoadConfigSchematics.obtainField("promptTemplate")).toThrow(
      "Cannot access key promptTemplate",
    );
  });

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
