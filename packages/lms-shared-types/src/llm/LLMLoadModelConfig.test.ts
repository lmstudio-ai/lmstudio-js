import {
  llmLoadModelConfigSchema,
  resolveEffectiveLLMLoadSpeculativeDecodingConfig,
  resolveLLMLoadSpeculativeDecodingConfig,
  type LLMLoadSpeculativeDecodingConfig,
  validateLLMLoadSpeculativeDecodingConfig,
} from "./LLMLoadModelConfig.js";

function expectSpeculativeConfigRejectedByHelpers(
  config: LLMLoadSpeculativeDecodingConfig,
  expectedMessage: string,
) {
  expect(() => validateLLMLoadSpeculativeDecodingConfig(config)).toThrow(expectedMessage);
  expect(() => resolveLLMLoadSpeculativeDecodingConfig(config)).toThrow(expectedMessage);
}

describe("LLMLoadModelConfig schema", () => {
  it("accepts llama context checkpoints including 0", () => {
    expect(llmLoadModelConfigSchema.safeParse({ contextCheckpoints: 0 }).success).toBe(true);
    expect(llmLoadModelConfigSchema.safeParse({ contextCheckpoints: 32 }).success).toBe(true);
  });

  it("rejects invalid llama context checkpoint values", () => {
    expect(llmLoadModelConfigSchema.safeParse({ contextCheckpoints: -1 }).success).toBe(false);
    expect(llmLoadModelConfigSchema.safeParse({ contextCheckpoints: 1.5 }).success).toBe(false);
  });
});

describe("LLMLoad speculative decoding validation", () => {
  it("rejects invalid draft selector values through the public helpers", () => {
    const invalidConfigCases: Array<{
      config: unknown;
      expectedMessage: string;
    }> = [
      {
        config: { speculativeDraftMtp: "true" },
        expectedMessage: "speculativeDraftMtp must be a boolean",
      },
      {
        config: { speculativeDraftMtp: 1 },
        expectedMessage: "speculativeDraftMtp must be a boolean",
      },
      {
        config: { speculativeDraftMtp: null },
        expectedMessage: "speculativeDraftMtp must be a boolean",
      },
      {
        config: { speculativeDraftSimple: "true" },
        expectedMessage: "speculativeDraftSimple must be a boolean",
      },
      {
        config: { speculativeDraftSimple: 1 },
        expectedMessage: "speculativeDraftSimple must be a boolean",
      },
      {
        config: { speculativeDraftSimple: null },
        expectedMessage: "speculativeDraftSimple must be a boolean",
      },
      {
        config: { speculativeDraftDflash: "true" },
        expectedMessage: "speculativeDraftDflash must be a boolean",
      },
      {
        config: { speculativeDraftDflash: 1 },
        expectedMessage: "speculativeDraftDflash must be a boolean",
      },
      {
        config: { speculativeDraftDflash: null },
        expectedMessage: "speculativeDraftDflash must be a boolean",
      },
      {
        config: { speculativeDraftDspark: "true" },
        expectedMessage: "speculativeDraftDspark must be a boolean",
      },
      {
        config: { speculativeDraftDspark: 1 },
        expectedMessage: "speculativeDraftDspark must be a boolean",
      },
      {
        config: { speculativeDraftDspark: null },
        expectedMessage: "speculativeDraftDspark must be a boolean",
      },
    ];

    for (const invalidConfigCase of invalidConfigCases) {
      expectSpeculativeConfigRejectedByHelpers(
        invalidConfigCase.config as LLMLoadSpeculativeDecodingConfig,
        invalidConfigCase.expectedMessage,
      );
      expect(llmLoadModelConfigSchema.safeParse(invalidConfigCase.config).success).toBe(false);
    }
  });

  it("rejects invalid draft model values through the public helpers", () => {
    const invalidConfigCases: Array<{
      config: unknown;
      expectedMessage: string;
    }> = [
      {
        config: { speculativeDraftModel: null },
        expectedMessage: "speculativeDraftModel must be a string or false",
      },
      {
        config: { speculativeDraftModel: 42 },
        expectedMessage: "speculativeDraftModel must be a string or false",
      },
    ];

    for (const invalidConfigCase of invalidConfigCases) {
      expectSpeculativeConfigRejectedByHelpers(
        invalidConfigCase.config as LLMLoadSpeculativeDecodingConfig,
        invalidConfigCase.expectedMessage,
      );
      expect(llmLoadModelConfigSchema.safeParse(invalidConfigCase.config).success).toBe(false);
    }
  });

  it("rejects invalid scalar values through the public helpers", () => {
    const invalidConfigCases: Array<{
      config: LLMLoadSpeculativeDecodingConfig;
      expectedMessage: string;
    }> = [
      {
        config: { speculativeDraftMaxTokens: -1 },
        expectedMessage: "speculativeDraftMaxTokens must be an integer greater than or equal to 0",
      },
      {
        config: { speculativeDraftMaxTokens: 1.5 },
        expectedMessage: "speculativeDraftMaxTokens must be an integer greater than or equal to 0",
      },
      {
        config: { speculativeDraftMinTokens: -1 },
        expectedMessage: "speculativeDraftMinTokens must be an integer greater than or equal to 0",
      },
      {
        config: { speculativeDraftMinTokens: 1.5 },
        expectedMessage: "speculativeDraftMinTokens must be an integer greater than or equal to 0",
      },
      {
        config: { speculativeDraftMinContinueProbability: -0.1 },
        expectedMessage: "speculativeDraftMinContinueProbability must be between 0 and 1",
      },
      {
        config: { speculativeDraftMinContinueProbability: 1.5 },
        expectedMessage: "speculativeDraftMinContinueProbability must be between 0 and 1",
      },
    ];

    for (const invalidConfigCase of invalidConfigCases) {
      expectSpeculativeConfigRejectedByHelpers(
        invalidConfigCase.config,
        invalidConfigCase.expectedMessage,
      );
      expect(llmLoadModelConfigSchema.safeParse(invalidConfigCase.config).success).toBe(false);
    }
  });

  it("allows valid orphan draft tuning fields", () => {
    const config: LLMLoadSpeculativeDecodingConfig = {
      speculativeDraftMaxTokens: 8,
      speculativeDraftMinTokens: 2,
      speculativeDraftMinContinueProbability: 0.5,
    };

    expect(() => validateLLMLoadSpeculativeDecodingConfig(config)).not.toThrow();
    expect(resolveLLMLoadSpeculativeDecodingConfig(config)).toEqual({
      type: "none",
      speculativeDraftMaxTokens: 8,
      speculativeDraftMinTokens: 2,
      speculativeDraftMinContinueProbability: 0.5,
    });
    expect(llmLoadModelConfigSchema.safeParse(config).success).toBe(true);
  });

  it("allows absent, empty, and disabled draft model values", () => {
    const absentDraftModelConfig: LLMLoadSpeculativeDecodingConfig = {};
    const emptyDraftModelConfig: LLMLoadSpeculativeDecodingConfig = {
      speculativeDraftModel: "",
    };
    const disabledDraftModelConfig: LLMLoadSpeculativeDecodingConfig = {
      speculativeDraftModel: false,
    };

    expect(() => validateLLMLoadSpeculativeDecodingConfig(absentDraftModelConfig)).not.toThrow();
    expect(resolveLLMLoadSpeculativeDecodingConfig(absentDraftModelConfig)).toEqual({
      type: "none",
    });
    expect(llmLoadModelConfigSchema.safeParse(absentDraftModelConfig).success).toBe(true);

    expect(() => validateLLMLoadSpeculativeDecodingConfig(emptyDraftModelConfig)).not.toThrow();
    expect(resolveLLMLoadSpeculativeDecodingConfig(emptyDraftModelConfig)).toEqual({
      type: "none",
    });
    expect(llmLoadModelConfigSchema.safeParse(emptyDraftModelConfig).success).toBe(true);

    expect(() => validateLLMLoadSpeculativeDecodingConfig(disabledDraftModelConfig)).not.toThrow();
    expect(resolveLLMLoadSpeculativeDecodingConfig(disabledDraftModelConfig)).toEqual({
      type: "off",
    });
    expect(llmLoadModelConfigSchema.safeParse(disabledDraftModelConfig).success).toBe(true);
  });

  it("tolerates deprecated external selector booleans without a draft model", () => {
    const config: LLMLoadSpeculativeDecodingConfig = {
      speculativeDraftSimple: true,
      speculativeDraftDflash: true,
      speculativeDraftDspark: true,
    };

    expect(() => validateLLMLoadSpeculativeDecodingConfig(config)).not.toThrow();
    expect(resolveLLMLoadSpeculativeDecodingConfig(config)).toEqual({
      type: "none",
    });
    expect(llmLoadModelConfigSchema.safeParse(config).success).toBe(true);
  });

  it("rejects invalid cross-field speculative decoding combinations", () => {
    expectSpeculativeConfigRejectedByHelpers(
      {
        speculativeDraftMtp: true,
        speculativeDraftModel: "publisher/draft-model",
      },
      "speculativeDraftMtp and speculativeDraftModel cannot both be enabled",
    );

    expectSpeculativeConfigRejectedByHelpers(
      {
        speculativeDraftMtp: true,
        speculativeDraftDflash: true,
        speculativeDraftModel: "publisher/draft-model",
      },
      "speculativeDraftMtp and speculativeDraftDflash cannot both be enabled",
    );

    expectSpeculativeConfigRejectedByHelpers(
      {
        speculativeDraftMaxTokens: 1,
        speculativeDraftMinTokens: 2,
      },
      "speculativeDraftMinTokens must be less than or equal to speculativeDraftMaxTokens",
    );
  });

  it("resolves valid inferred external draft model request config", () => {
    const config: LLMLoadSpeculativeDecodingConfig = {
      speculativeDraftModel: "publisher/draft-model",
      speculativeDraftMaxTokens: 16,
      speculativeDraftMinTokens: 0,
      speculativeDraftMinContinueProbability: 0.75,
    };

    expect(() => validateLLMLoadSpeculativeDecodingConfig(config)).not.toThrow();
    expect(resolveLLMLoadSpeculativeDecodingConfig(config)).toEqual({
      type: "draftSimple",
      speculativeDraftModel: "publisher/draft-model",
      speculativeDraftMaxTokens: 16,
      speculativeDraftMinTokens: 0,
      speculativeDraftMinContinueProbability: 0.75,
    });
    expect(llmLoadModelConfigSchema.safeParse(config).success).toBe(true);
  });

  it("resolves valid explicit bundled Draft MTP request config", () => {
    const config: LLMLoadSpeculativeDecodingConfig = {
      speculativeDraftMtp: true,
      speculativeDraftModel: "",
    };

    expect(() => validateLLMLoadSpeculativeDecodingConfig(config)).not.toThrow();
    expect(resolveLLMLoadSpeculativeDecodingConfig(config)).toEqual({
      type: "draftMtp",
    });
    expect(llmLoadModelConfigSchema.safeParse(config).success).toBe(true);
  });

  it("resolves valid explicit Draft Simple request config", () => {
    const config: LLMLoadSpeculativeDecodingConfig = {
      speculativeDraftSimple: true,
      speculativeDraftModel: "publisher/draft-model",
      speculativeDraftMaxTokens: 16,
      speculativeDraftMinTokens: 0,
      speculativeDraftMinContinueProbability: 0.75,
    };

    expect(() => validateLLMLoadSpeculativeDecodingConfig(config)).not.toThrow();
    expect(resolveLLMLoadSpeculativeDecodingConfig(config)).toEqual({
      type: "draftSimple",
      speculativeDraftModel: "publisher/draft-model",
      speculativeDraftMaxTokens: 16,
      speculativeDraftMinTokens: 0,
      speculativeDraftMinContinueProbability: 0.75,
    });
    expect(llmLoadModelConfigSchema.safeParse(config).success).toBe(true);
  });

  it("resolves valid explicit DFlash request config", () => {
    const config: LLMLoadSpeculativeDecodingConfig = {
      speculativeDraftDflash: true,
      speculativeDraftModel: "publisher/dflash-draft-model",
      speculativeDraftMaxTokens: 16,
      speculativeDraftMinTokens: 0,
      speculativeDraftMinContinueProbability: 0.75,
    };

    expect(() => validateLLMLoadSpeculativeDecodingConfig(config)).not.toThrow();
    expect(resolveLLMLoadSpeculativeDecodingConfig(config)).toEqual({
      type: "draftDflash",
      speculativeDraftModel: "publisher/dflash-draft-model",
      speculativeDraftMaxTokens: 16,
      speculativeDraftMinTokens: 0,
      speculativeDraftMinContinueProbability: 0.75,
    });
    expect(llmLoadModelConfigSchema.safeParse(config).success).toBe(true);
  });

  it("resolves valid explicit DSpark request config", () => {
    const config: LLMLoadSpeculativeDecodingConfig = {
      speculativeDraftDspark: true,
      speculativeDraftModel: "publisher/dspark-draft-model",
      speculativeDraftMaxTokens: 16,
      speculativeDraftMinTokens: 0,
      speculativeDraftMinContinueProbability: 0.75,
    };

    expect(() => validateLLMLoadSpeculativeDecodingConfig(config)).not.toThrow();
    expect(resolveLLMLoadSpeculativeDecodingConfig(config)).toEqual({
      type: "draftDspark",
      speculativeDraftModel: "publisher/dspark-draft-model",
      speculativeDraftMaxTokens: 16,
      speculativeDraftMinTokens: 0,
      speculativeDraftMinContinueProbability: 0.75,
    });
    expect(llmLoadModelConfigSchema.safeParse(config).success).toBe(true);
  });

  it("uses collapsed-config precedence in effective config resolution", () => {
    const externalDraftConfig: LLMLoadSpeculativeDecodingConfig = {
      speculativeDraftMtp: false,
      speculativeDraftSimple: false,
      speculativeDraftModel: "publisher/draft-model",
    };
    const draftMtpConfig: LLMLoadSpeculativeDecodingConfig = {
      speculativeDraftMtp: true,
      speculativeDraftSimple: false,
      speculativeDraftModel: "publisher/draft-model",
    };

    expect(resolveEffectiveLLMLoadSpeculativeDecodingConfig(externalDraftConfig)).toEqual({
      type: "draftSimple",
      speculativeDraftModel: "publisher/draft-model",
    });
    expect(resolveEffectiveLLMLoadSpeculativeDecodingConfig(draftMtpConfig)).toEqual({
      type: "draftMtp",
    });
  });

  it("does not duplicate full schema scalar validation issues", () => {
    const parsedConfig = llmLoadModelConfigSchema.safeParse({
      speculativeDraftMaxTokens: -1,
    });

    expect(parsedConfig.success).toBe(false);
    if (!parsedConfig.success) {
      const maxTokenIssues = parsedConfig.error.issues.filter(
        issue => issue.path.join(".") === "speculativeDraftMaxTokens",
      );
      expect(maxTokenIssues).toHaveLength(1);
    }
  });

  it("does not duplicate full schema draft model field validation issues", () => {
    const parsedConfig = llmLoadModelConfigSchema.safeParse({
      speculativeDraftModel: 42,
    });

    expect(parsedConfig.success).toBe(false);
    if (!parsedConfig.success) {
      const draftModelIssues = parsedConfig.error.issues.filter(
        issue => issue.path.join(".") === "speculativeDraftModel",
      );
      expect(draftModelIssues).toHaveLength(1);
    }
  });
});
