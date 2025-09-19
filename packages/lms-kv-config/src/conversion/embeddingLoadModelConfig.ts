import {
  convertGPUSettingToGPUSplitConfig,
  convertGPUSplitConfigToGPUSetting,
  type EmbeddingLoadModelConfig,
  type KVConfig,
} from "@lmstudio/lms-shared-types";
import { collapseKVStackRaw } from "../KVConfig.js";
import { embeddingLoadSchematics } from "../schema.js";

export function kvConfigToEmbeddingLoadModelConfig(
  config: KVConfig,
  notPartial?: boolean,
): EmbeddingLoadModelConfig {
  const result: EmbeddingLoadModelConfig = {};

  let parsed;
  if (notPartial === true) {
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
  if (ropeFrequencyBase !== undefined && ropeFrequencyBase.checked === true) {
    result.ropeFrequencyBase = ropeFrequencyBase.value;
  }

  const ropeFrequencyScale = parsed.get("llama.ropeFrequencyScale");
  if (ropeFrequencyScale !== undefined && ropeFrequencyScale.checked === true) {
    result.ropeFrequencyScale = ropeFrequencyScale.value;
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
    "llama.ropeFrequencyBase":
      config.ropeFrequencyBase !== undefined
        ? { value: config.ropeFrequencyBase, checked: true }
        : undefined,
    "llama.ropeFrequencyScale":
      config.ropeFrequencyScale !== undefined
        ? { value: config.ropeFrequencyScale, checked: true }
        : undefined,

    "llama.keepModelInMemory": config.keepModelInMemory,
    "llama.tryMmap": config.tryMmap,
  });
  return collapseKVStackRaw([top]);
}
