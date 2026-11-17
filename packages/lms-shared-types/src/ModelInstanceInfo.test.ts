import { modelInstanceInfoSchema } from "./ModelInfo.js";

const baseInfo = {
  modelKey: "test/model",
  format: "gguf",
  displayName: "Model",
  publisher: "test",
  path: "test/model.gguf",
  sizeBytes: 1,
  indexedModelIdentifier: "test/model",
  deviceIdentifier: null,
  identifier: "model",
  instanceReference: "instance",
  ttlMs: null,
  lastUsedTime: null,
  contextLength: 4096,
};

const domains = [
  { type: "llm", vision: false, trainedForToolUse: false, maxContextLength: 8192 },
  { type: "embedding", maxContextLength: 8192 },
  { type: "decision", hasVisionAdapter: false },
];

describe.each(domains)("$type instance metadata", domain => {
  test("preserves the host's executing family, including future engines", () => {
    const info = { ...baseInfo, ...domain, engine: "future-engine" };
    expect(modelInstanceInfoSchema.parse(info).engine).toBe("future-engine");
  });

  test("accepts an older host without engine metadata", () => {
    const info = { ...baseInfo, ...domain };
    expect(modelInstanceInfoSchema.parse(info)).not.toHaveProperty("engine");
  });
});
