import { type LLMLoadModelConfig } from "@lmstudio/lms-shared-types";
import { kvConfigField, makeKVConfigFromFields } from "../KVConfig.js";
import { llmLlamaMoeLoadConfigSchematics } from "../schema.js";
import {
  kvConfigToLLMLoadModelConfig,
  llmLoadModelConfigToKVConfig,
} from "./llmLoadModelConfig.js";

/**
 * Helper: convert an LLMLoadModelConfig to KVConfig, then parse back the `llama.fit`
 * field. Returns `undefined` when the field is absent from the produced KVConfig.
 */
function fitFieldAfterConversion(config: LLMLoadModelConfig): boolean | undefined {
  const kvConfig = llmLoadModelConfigToKVConfig(config);
  const parsed = llmLlamaMoeLoadConfigSchematics.parsePartial(kvConfig);
  return parsed.get("llama.fit");
}

describe("llmLoadModelConfigToKVConfig — fit inference", () => {
  it("preserves explicit fit: true", () => {
    expect(fitFieldAfterConversion({ fit: true })).toBe(true);
  });

  it("preserves explicit fit: false", () => {
    expect(fitFieldAfterConversion({ fit: false })).toBe(false);
  });

  it("infers fit=false when ratio is set without fit", () => {
    expect(fitFieldAfterConversion({ gpu: { ratio: 0.5 } })).toBe(false);
  });

  it("infers fit=false when numCpuExpertLayersRatio is set without fit", () => {
    expect(fitFieldAfterConversion({ gpu: { numCpuExpertLayersRatio: 0.5 } })).toBe(false);
  });

  it("infers fit=false when mainGpu is set without fit (including mainGpu: 0)", () => {
    expect(fitFieldAfterConversion({ gpu: { mainGpu: 0 } })).toBe(false);
    expect(fitFieldAfterConversion({ gpu: { mainGpu: 1 } })).toBe(false);
  });

  it("infers fit=false when splitStrategy is set without fit", () => {
    expect(fitFieldAfterConversion({ gpu: { splitStrategy: "evenly" } })).toBe(false);
  });

  it("does NOT infer fit=false when only disabledGpus is set", () => {
    expect(fitFieldAfterConversion({ gpu: { disabledGpus: [1] } })).toBeUndefined();
  });

  it("does NOT infer fit when no GPU config is provided", () => {
    expect(fitFieldAfterConversion({})).toBeUndefined();
  });

  it("explicit fit: true wins even when ratio is also set", () => {
    expect(fitFieldAfterConversion({ fit: true, gpu: { ratio: 0.5 } })).toBe(true);
  });

  it("explicit fit: false is preserved even with no other GPU params", () => {
    expect(fitFieldAfterConversion({ fit: false })).toBe(false);
  });
});

describe("kvConfigToLLMLoadModelConfig — fit field read-back", () => {
  // KVConfig field keys use the full global path (llm.load.* prefix) because
  // the schematics preserve the original fullKey even after scoping.
  it("reads fit=true from KVConfig", () => {
    const kvConfig = makeKVConfigFromFields([kvConfigField("llm.load.llama.fit", true)]);
    const result = kvConfigToLLMLoadModelConfig(kvConfig);
    expect(result.fit).toBe(true);
  });

  it("reads fit=false from KVConfig", () => {
    const kvConfig = makeKVConfigFromFields([kvConfigField("llm.load.llama.fit", false)]);
    const result = kvConfigToLLMLoadModelConfig(kvConfig);
    expect(result.fit).toBe(false);
  });

  it("fit is undefined when absent from KVConfig", () => {
    const kvConfig = makeKVConfigFromFields([]);
    const result = kvConfigToLLMLoadModelConfig(kvConfig);
    expect(result.fit).toBeUndefined();
  });

  it("does not surface fit-ignored GPU defaults when fit=true and defaults are requested", () => {
    const fitEnabledKVConfig = makeKVConfigFromFields([kvConfigField("llm.load.llama.fit", true)]);
    const result = kvConfigToLLMLoadModelConfig(fitEnabledKVConfig, {
      useDefaultsForMissingKeys: true,
    });

    expect(result.fit).toBe(true);
    expect(result.gpu).toBeUndefined();
  });

  it("preserves only disabledGpus when fit=true", () => {
    const fitEnabledKVConfig = makeKVConfigFromFields([
      kvConfigField("llm.load.llama.fit", true),
      kvConfigField("load.gpuSplitConfig", {
        strategy: "priorityOrder",
        disabledGpus: [1],
        priority: [2],
        customRatio: [],
      }),
      kvConfigField("llm.load.llama.acceleration.offloadRatio", 0.25),
    ]);

    const result = kvConfigToLLMLoadModelConfig(fitEnabledKVConfig, {
      useDefaultsForMissingKeys: true,
    });

    expect(result.fit).toBe(true);
    expect(result.gpu).toEqual({ disabledGpus: [1] });
  });
});

describe("round-trip", () => {
  it("strips fit-ignored GPU fields through config → KVConfig → config when fit=true", () => {
    const original: LLMLoadModelConfig = {
      fit: true,
      gpu: {
        ratio: 0.5,
        disabledGpus: [1],
        mainGpu: 0,
        splitStrategy: "favorMainGpu",
      },
    };
    const kvConfig = llmLoadModelConfigToKVConfig(original);
    const result = kvConfigToLLMLoadModelConfig(kvConfig);
    expect(result).toEqual({
      fit: true,
      gpu: { disabledGpus: [1] },
    });
  });

  it("preserves inferred fit=false through round-trip when ratio is set", () => {
    const original: LLMLoadModelConfig = { gpu: { ratio: 0.75 } };
    const kvConfig = llmLoadModelConfigToKVConfig(original);
    const result = kvConfigToLLMLoadModelConfig(kvConfig);
    expect(result.fit).toBe(false);
    expect(result.gpu?.ratio).toBe(0.75);
  });
});
