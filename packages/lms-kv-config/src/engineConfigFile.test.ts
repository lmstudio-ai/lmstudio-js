import { isEngineConfigFileField, isEngineConfigFileMode } from "./engineConfigFile.js";
import { collapseKVStackRaw, emptyKVConfig, filterKVConfig } from "./KVConfig.js";
import {
  globalConfigSchematics,
  llmLlamaLoadConfigSchematics,
  llmMlxLoadConfigSchematics,
  llmVllmLoadConfigSchematics,
} from "./schema.js";

describe("engine config-file fields", () => {
  const saved = globalConfigSchematics.buildPartialConfig({
    "llm.load.engineConfigFileContents": "# unchanged\nmax-model-len: auto\n",
    "llm.load.engineCwd": "/models/assets",
    "llm.load.contextLength": 4096,
  });

  it("preserves contents and independent empty/omitted overrides", () => {
    expect(isEngineConfigFileMode(emptyKVConfig)).toBe(false);
    expect(isEngineConfigFileMode(collapseKVStackRaw([saved, emptyKVConfig]))).toBe(true);
    const resetDirectory = collapseKVStackRaw([
      saved,
      globalConfigSchematics.buildPartialConfig({ "llm.load.engineCwd": "" }),
    ]);
    expect(isEngineConfigFileMode(resetDirectory)).toBe(true);
    expect(globalConfigSchematics.access(resetDirectory, "llm.load.engineCwd")).toBe("");
    const disabled = collapseKVStackRaw([
      saved,
      globalConfigSchematics.buildPartialConfig({ "llm.load.engineConfigFileContents": "" }),
    ]);
    expect(isEngineConfigFileMode(disabled)).toBe(false);
    expect(globalConfigSchematics.access(disabled, "llm.load.engineCwd")).toBe("/models/assets");
    expect(globalConfigSchematics.access(saved, "llm.load.engineConfigFileContents")).toBe(
      "# unchanged\nmax-model-len: auto\n",
    );
  });

  it("exposes machine-dependent strings only in the vLLM engine schema", () => {
    for (const key of ["llm.load.engineConfigFileContents", "llm.load.engineCwd"] as const) {
      expect(globalConfigSchematics.access(emptyKVConfig, key)).toBe("");
      expect(globalConfigSchematics.getValueTypeParam(key).machineDependent).toBe(true);
      expect(globalConfigSchematics.getValueTypeParam(key).nonConfigurable).toBe(true);
      expect(llmVllmLoadConfigSchematics.hasFullKey(key)).toBe(true);
      expect(llmLlamaLoadConfigSchematics.hasFullKey(key)).toBe(false);
      expect(llmMlxLoadConfigSchematics.hasFullKey(key)).toBe(false);
    }
    expect(llmVllmLoadConfigSchematics.filterConfig(saved)).toEqual(saved);
  });

  it("excludes only the protected fields from portable configuration", () => {
    expect(filterKVConfig(saved, key => !isEngineConfigFileField(key))).toEqual(
      globalConfigSchematics.buildPartialConfig({ "llm.load.contextLength": 4096 }),
    );
  });
});
