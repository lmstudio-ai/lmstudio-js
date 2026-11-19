import { llmLoadSchematics, llmOpenVinoLoadConfigSchematics } from "../schema.js";
import { kvConfigToLLMLoadModelConfig } from "./llmLoadModelConfig.js";

test("OpenVINO load readback preserves parallel session overrides", () => {
  const config = llmOpenVinoLoadConfigSchematics.buildPartialConfig({ numParallelSessions: 3 });
  expect(kvConfigToLLMLoadModelConfig(config, { modelFormat: "openvino" })).toEqual({
    maxParallelPredictions: 3,
  });
});

test("OpenVINO readback includes actualized context without exposing a context load setting", () => {
  const config = llmLoadSchematics.buildPartialConfig({
    contextLength: 262144,
    numParallelSessions: 2,
  });
  expect(kvConfigToLLMLoadModelConfig(config, { modelFormat: "openvino" })).toEqual({
    contextLength: 262144,
    maxParallelPredictions: 2,
  });
  expect(llmOpenVinoLoadConfigSchematics.hasFullKey("llm.load.contextLength")).toBe(false);
});

test("OpenVINO partial readback does not manufacture defaults", () => {
  expect(kvConfigToLLMLoadModelConfig({ fields: [] }, { modelFormat: "openvino" })).toEqual({});
});

test("OpenVINO default readback uses the engine schematic", () => {
  const config = { fields: [] };
  expect(
    kvConfigToLLMLoadModelConfig(config, {
      modelFormat: "openvino",
      useDefaultsForMissingKeys: true,
    }),
  ).toEqual({
    maxParallelPredictions: llmOpenVinoLoadConfigSchematics
      .parse(config)
      .get("numParallelSessions"),
  });
});
