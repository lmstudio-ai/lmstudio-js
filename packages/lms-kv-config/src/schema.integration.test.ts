import {
  globalConfigSchematics,
  llmLlamaLoadConfigSchematics,
  llmPredictionConfigSchematics,
} from "./schema.js";
import { kvConfigField, makeKVConfigFromFields } from "./KVConfig.js";

describe("schema integration", () => {
  it("globalConfigSchematics lenient schema allows extension prefixes", () => {
    const config = makeKVConfigFromFields([
      kvConfigField("ext.virtualModel.customField.foo", { any: "thing" }),
      kvConfigField("llm.prediction.temperature", 0.5),
    ]);
    const parsed = globalConfigSchematics.getLenientZodSchema().parse(config);
    expect(parsed.fields.length).toBe(2);
  });

  it("llmPredictionConfigSchematics accesses short keys for full key configs", () => {
    const config = makeKVConfigFromFields([kvConfigField("llm.prediction.temperature", 0.25)]);
    expect(llmPredictionConfigSchematics.access(config, "temperature")).toBe(0.25);
  });

  it("llmLlamaLoadConfigSchematics exposes expected full keys", () => {
    expect(llmLlamaLoadConfigSchematics.hasFullKey("llm.load.llama.acceleration.offloadRatio")).toBe(
      true,
    );
    expect(llmLlamaLoadConfigSchematics.hasFullKey("load.gpuSplitConfig")).toBe(true);
  });
});
