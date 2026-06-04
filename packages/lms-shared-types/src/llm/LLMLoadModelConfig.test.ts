import {
  llmLoadModelConfigSchema,
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

describe("LLMLoad speculative decoding validation", () => {
  it("rejects invalid Draft MTP values through the public helpers", () => {
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
        config: { speculativeDraftModel: "" },
        expectedMessage: "speculativeDraftModel must be a non-empty string",
      },
      {
        config: { speculativeDraftModel: null },
        expectedMessage: "speculativeDraftModel must be a non-empty string",
      },
      {
        config: { speculativeDraftModel: 42 },
        expectedMessage: "speculativeDraftModel must be a non-empty string",
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

  it("allows absent and non-empty draft model values", () => {
    const absentDraftModelConfig: LLMLoadSpeculativeDecodingConfig = {};
    const draftModelConfig: LLMLoadSpeculativeDecodingConfig = {
      speculativeDraftModel: "publisher/draft-model",
    };

    expect(() => validateLLMLoadSpeculativeDecodingConfig(absentDraftModelConfig)).not.toThrow();
    expect(resolveLLMLoadSpeculativeDecodingConfig(absentDraftModelConfig)).toEqual({
      type: "none",
    });
    expect(llmLoadModelConfigSchema.safeParse(absentDraftModelConfig).success).toBe(true);

    expect(() => validateLLMLoadSpeculativeDecodingConfig(draftModelConfig)).not.toThrow();
    expect(resolveLLMLoadSpeculativeDecodingConfig(draftModelConfig)).toEqual({
      type: "draftModel",
      speculativeDraftModel: "publisher/draft-model",
    });
    expect(llmLoadModelConfigSchema.safeParse(draftModelConfig).success).toBe(true);
  });

  it("keeps cross-field speculative decoding validation unchanged", () => {
    expectSpeculativeConfigRejectedByHelpers(
      {
        speculativeDraftMtp: true,
        speculativeDraftModel: "publisher/draft-model",
      },
      "speculativeDraftMtp and speculativeDraftModel cannot both be enabled",
    );

    expectSpeculativeConfigRejectedByHelpers(
      {
        speculativeDraftMaxTokens: 1,
        speculativeDraftMinTokens: 2,
      },
      "speculativeDraftMinTokens must be less than or equal to speculativeDraftMaxTokens",
    );
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
      speculativeDraftModel: "",
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
