import {
  convertGPUSettingToGPUSplitConfig,
  convertGPUSplitConfigToGPUSetting,
  type EmbeddingLoadModelConfig,
  type KVConfig,
} from "@lmstudio/lms-shared-types";
import { collapseKVStackRaw } from "../KVConfig.js";
import { embeddingLoadSchematics } from "../schema.js";
import { maybeFalseValueToCheckboxValue } from "./utils.js";

interface KvConfigToEmbeddingLoadModelConfigOpts {
  /**
   * Fills the missing keys passed in with default values
   */
  useDefaultsForMissingKeys?: boolean;
}
export function kvConfigToEmbeddingLoadModelConfig(
  config: KVConfig,
  { useDefaultsForMissingKeys }: KvConfigToEmbeddingLoadModelConfigOpts = {},
): EmbeddingLoadModelConfig {
  const result: EmbeddingLoadModelConfig = {};

  let parsed;
  if (useDefaultsForMissingKeys === true) {
    parsed = embeddingLoadSchematics.parse(config);
  } else {
    parsed = embeddingLoadSchematics.parsePartial(config);
  }

  const gpuSplitConfig = parsed.get("load.gpuSplitConfig");
  if (gpuSplitConfig !== undefined) {
    const gpuSetting = convertGPUSplitConfigToGPUSetting(gpuSplitConfig);
    result.gpu = gpuSetting;
  }
  const contextLength = parsed.get("contextLength");
  if (contextLength !== undefined) {
    result.contextLength = contextLength;
  }
  const ropeFrequencyBase = parsed.get("llama.ropeFrequencyBase");
  if (ropeFrequencyBase !== undefined) {
    result.ropeFrequencyBase = ropeFrequencyBase.checked ? ropeFrequencyBase.value : false;
  }

  const ropeFrequencyScale = parsed.get("llama.ropeFrequencyScale");
  if (ropeFrequencyScale !== undefined) {
    result.ropeFrequencyScale = ropeFrequencyScale.checked ? ropeFrequencyScale.value : false;
  }

  const keepModelInMemory = parsed.get("llama.keepModelInMemory");
  if (keepModelInMemory !== undefined) {
    result.keepModelInMemory = keepModelInMemory;
  }

  const tryMmap = parsed.get("llama.tryMmap");
  if (tryMmap !== undefined) {
    result.tryMmap = tryMmap;
  }

  return result;
}

export function embeddingLoadModelConfigToKVConfig(config: EmbeddingLoadModelConfig): KVConfig {
  const top = embeddingLoadSchematics.buildPartialConfig({
    "load.gpuSplitConfig": convertGPUSettingToGPUSplitConfig(config.gpu),
    "contextLength": config.contextLength,
    "llama.ropeFrequencyBase": maybeFalseValueToCheckboxValue(config.ropeFrequencyBase, 0),
    "llama.ropeFrequencyScale": maybeFalseValueToCheckboxValue(config.ropeFrequencyScale, 0),
    "llama.keepModelInMemory": config.keepModelInMemory,
    "llama.tryMmap": config.tryMmap,
  });
  return collapseKVStackRaw([top]);
}
