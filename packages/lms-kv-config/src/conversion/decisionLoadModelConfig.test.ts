import { decisionLoadModelConfigSchema } from "@lmstudio/lms-shared-types";
import { decisionLlamaLoadConfigSchematics } from "../schema.js";
import {
  decisionLoadConfigToLlamaConfig,
  decisionLoadModelConfigToKVConfig,
  kvConfigToDecisionLoadModelConfig,
} from "./decisionLoadModelConfig.js";

test("manual decision controls round-trip without chat keys, including engine-default context and physical batching", () => {
  const requested = {
    contextLength: 0,
    autoFit: false,
    maxParallelPredictions: 6,
    useUnifiedKvCache: false,
    gpu: { ratio: 0.5, disabledGpus: [1] },
    evalBatchSize: 1024,
    physicalBatchSize: 256,
    tryMmap: false,
    flashAttention: true,
    llamaVCacheQuantizationType: "q8_0" as const,
  };
  const config = decisionLoadModelConfigToKVConfig(requested);
  expect(config.fields.some(field => field.key.startsWith("llm."))).toBe(false);
  expect(kvConfigToDecisionLoadModelConfig(config)).toMatchObject(requested);
  const parsed = decisionLlamaLoadConfigSchematics.parse(config);
  expect(parsed.get("llama.physicalBatchSize")).toBe(256);
});

test.each([
  { contextLength: 4096 },
  { autoFit: false },
  { autoFit: true },
  { gpu: { ratio: 0.5 } },
])("SDK load controls %p produce only settings accepted by decision preflight", requested => {
  const config = decisionLoadModelConfigToKVConfig(requested);
  // Preflight rejects unknown decision fields; a round-trip alone can silently drop them.
  expect(decisionLlamaLoadConfigSchematics.getLenientZodSchema().parse(config)).toEqual(config);
  expect(kvConfigToDecisionLoadModelConfig(config)).toMatchObject(requested);
});

test("partial conversion does not manufacture defaults or overwrite inherited settings", () => {
  expect(kvConfigToDecisionLoadModelConfig({ fields: [] })).toEqual({});
  const partial = decisionLoadModelConfigToKVConfig({ physicalBatchSize: 128 });
  expect(partial.fields).toEqual([{ key: "decision.load.llama.physicalBatchSize", value: 128 }]);
  expect(kvConfigToDecisionLoadModelConfig(partial)).toEqual({ physicalBatchSize: 128 });
});

test("request AutoFit validation preserves GGUF manual-setting rules while readback retains actual context", () => {
  expect(decisionLoadModelConfigSchema.safeParse({ autoFit: true, contextLength: 0 }).success).toBe(
    false,
  );
  expect(
    decisionLoadModelConfigSchema.safeParse({ autoFit: true, gpu: { ratio: 0.5 } }).success,
  ).toBe(false);
  expect(
    decisionLoadModelConfigSchema.safeParse({ autoFit: true, gpu: { disabledGpus: [0] } }).success,
  ).toBe(true);
  const readback = decisionLlamaLoadConfigSchematics.buildPartialConfig({
    "llama.autoFit": true,
    "contextLength": 8192,
  });
  expect(kvConfigToDecisionLoadModelConfig(readback)).toMatchObject({
    autoFit: true,
    contextLength: 8192,
  });
});

test("the GGUF helper adapter retains common placement and parallel/batch fields without persisted LLM config", () => {
  const own = decisionLlamaLoadConfigSchematics.buildPartialConfig({
    "contextLength": 2048,
    "numParallelSessions": 3,
    "llama.autoFit": false,
    "llama.physicalBatchSize": 128,
    "load.gpuStrictVramCap": true,
  });
  const adapted = decisionLoadConfigToLlamaConfig(own);
  expect(adapted.fields).toEqual(
    expect.arrayContaining([
      { key: "llm.load.contextLength", value: 2048 },
      { key: "llm.load.numParallelSessions", value: 3 },
      { key: "llm.load.llama.physicalBatchSize", value: 128 },
      { key: "load.gpuStrictVramCap", value: true },
    ]),
  );
  expect(own.fields.some(field => field.key.startsWith("llm."))).toBe(false);
});
