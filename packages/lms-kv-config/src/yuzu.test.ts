import { modelCompatibilityTypeSchema, modelFormatNameSchema } from "@lmstudio/lms-shared-types";
import { kvConfigToLLMLoadModelConfig } from "./conversion/llmLoadModelConfig.js";
import { emptyKVConfig } from "./KVConfig.js";
import { llmYuzuLoadConfigSchematics, llmYuzuPredictionConfigSchematics } from "./schema.js";

describe("Yuzu config contract", () => {
  test("exports a dedicated model format", () => {
    expect(modelCompatibilityTypeSchema.parse("yuzu")).toBe("yuzu");
    expect(modelFormatNameSchema.parse("yuzu")).toBe("yuzu");
  });
  test("uses Yuzu sampling defaults rather than llama/MLX defaults", () => {
    const parsed = llmYuzuPredictionConfigSchematics.parse(emptyKVConfig);
    expect(parsed.get("temperature")).toBe(1);
    expect(parsed.get("topKSampling")).toBe(20);
    expect(parsed.get("topPSampling")).toEqual({ checked: true, value: 0.95 });
    expect(parsed.get("contextOverflowPolicy")).toBe("stopAtLimit");
  });
  test.each([0, 33, 40])("rejects top-k %s", topKSampling => {
    expect(() => llmYuzuPredictionConfigSchematics.buildPartialConfig({ topKSampling })).toThrow();
  });
  test("exposes only supported load keys and no unsupported cache/draft controls", () => {
    expect(Array.from(llmYuzuLoadConfigSchematics.fullKeys()).sort()).toEqual([
      "envVars",
      "llm.load.contextLength",
    ]);
    expect(
      Array.from(llmYuzuPredictionConfigSchematics.fullKeys()).some(key =>
        /mlx|vllm|speculativeDecoding|promptTemplate/.test(key),
      ),
    ).toBe(false);
    expect(kvConfigToLLMLoadModelConfig(emptyKVConfig, { modelFormat: "yuzu" })).toEqual({});
    expect(
      kvConfigToLLMLoadModelConfig(
        llmYuzuLoadConfigSchematics.buildPartialConfig({ contextLength: 8192 }),
        { modelFormat: "yuzu", useDefaultsForMissingKeys: true },
      ),
    ).toEqual({ contextLength: 8192 });
  });
});
