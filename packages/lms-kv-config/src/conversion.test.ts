import {
  embeddingLoadModelConfigToKVConfig,
  kvConfigToEmbeddingLoadModelConfig,
} from "./conversion/embeddingLoadModelConfig.js";
import {
  kvConfigToLLMLoadModelConfig,
  llmLoadModelConfigToKVConfig,
} from "./conversion/llmLoadModelConfig.js";
import {
  kvConfigToLLMPredictionConfig,
  llmPredictionConfigToKVConfig,
} from "./conversion/llmPredictionConfig.js";
import {
  llmLlamaMoeLoadConfigSchematics,
  llmMlxLoadConfigSchematics,
} from "./schema.js";
import { kvConfigField, kvConfigToMap, makeKVConfigFromFields } from "./KVConfig.js";

describe("conversion helpers", () => {
  it("llmPredictionConfigToKVConfig overrides raw config fields", () => {
    const raw = makeKVConfigFromFields([kvConfigField("llm.prediction.temperature", 0.1)]);
    const kv = llmPredictionConfigToKVConfig({ temperature: 0.9, raw });
    expect(kvConfigToMap(kv).get("llm.prediction.temperature")).toBe(0.9);
  });

  it("llmPredictionConfigToKVConfig maps maxTokens false to unchecked checkbox", () => {
    const kv = llmPredictionConfigToKVConfig({ maxTokens: false });
    expect(kvConfigToMap(kv).get("llm.prediction.maxPredictedTokens")).toEqual({
      checked: false,
      value: 1,
    });
    const round = kvConfigToLLMPredictionConfig(kv);
    expect(round.maxTokens).toBe(false);
  });

  it("kvConfigToLLMPredictionConfig can fill defaults", () => {
    const config = makeKVConfigFromFields([]);
    const result = kvConfigToLLMPredictionConfig(config, { useDefaultsForMissingKeys: true });
    expect(result.temperature).toBe(0.8);
  });

  it("kvConfigToLLMLoadModelConfig parses gguf fields", () => {
    const config = llmLlamaMoeLoadConfigSchematics.buildPartialConfig({
      "numParallelSessions": 5,
      "useUnifiedKvCache": false,
      "seed": { checked: true, value: 42 },
      "llama.evalBatchSize": 256,
    });
    const result = kvConfigToLLMLoadModelConfig(config, { modelFormat: "gguf" });
    expect(result.maxParallelPredictions).toBe(5);
    expect(result.useUnifiedKvCache).toBe(false);
    expect(result.seed).toBe(42);
    expect(result.evalBatchSize).toBe(256);
  });

  it("kvConfigToLLMLoadModelConfig parses safetensors fields", () => {
    const config = llmMlxLoadConfigSchematics.buildPartialConfig({
      "numParallelSessions": 3,
      "mlx.kvCacheQuantization": {
        enabled: false,
        bits: 8,
        groupSize: 64,
        quantizedStart: 5000,
      },
    });
    const result = kvConfigToLLMLoadModelConfig(config, { modelFormat: "safetensors" });
    expect(result.maxParallelPredictions).toBe(3);
    expect(result.mlxKvCacheQuantization).toBe(false);
  });

  it("llmLoadModelConfigToKVConfig maps mlx kv cache quantization", () => {
    const kv = llmLoadModelConfigToKVConfig({
      mlxKvCacheQuantization: {
        enabled: true,
        bits: 4,
        groupSize: 32,
        quantizedStart: 1000,
      },
    });
    expect(kvConfigToMap(kv).get("llm.load.mlx.kvCacheQuantization")).toEqual({
      enabled: true,
      bits: 4,
      groupSize: 32,
      quantizedStart: 1000,
    });
  });

  it("embedding load config converts rope frequency fields", () => {
    const kv = embeddingLoadModelConfigToKVConfig({
      contextLength: 4096,
      ropeFrequencyBase: false,
    });
    const map = kvConfigToMap(kv);
    expect(map.get("embedding.load.contextLength")).toBe(4096);
    expect(map.get("embedding.load.llama.ropeFrequencyBase")).toEqual({
      checked: false,
      value: 0,
    });

    const round = kvConfigToEmbeddingLoadModelConfig(kv);
    expect(round.contextLength).toBe(4096);
    expect(round.ropeFrequencyBase).toBe(false);
  });
});
