import { llmLoadSchematics, llmOpenVinoLoadConfigSchematics } from "../schema.js";
import { kvConfigToLLMLoadModelConfig } from "./llmLoadModelConfig.js";

test("OpenVINO load readback preserves parallel session overrides", () => {
  const config = llmOpenVinoLoadConfigSchematics.buildPartialConfig({ numParallelSessions: 3 });
  expect(kvConfigToLLMLoadModelConfig(config, { modelFormat: "openvino" })).toEqual({
    maxParallelPredictions: 3,
  });
});

test("OpenVINO readback includes actualized context", () => {
  const config = llmLoadSchematics.buildPartialConfig({
    contextLength: 262144,
    numParallelSessions: 2,
  });
  expect(kvConfigToLLMLoadModelConfig(config, { modelFormat: "openvino" })).toEqual({
    contextLength: 262144,
    maxParallelPredictions: 2,
  });
});

test("OpenVINO partial readback does not manufacture defaults", () => {
  expect(kvConfigToLLMLoadModelConfig({ fields: [] }, { modelFormat: "openvino" })).toEqual({});
});
