import {
  convertGPUSettingToGPUSplitConfig,
  convertGPUSplitConfigToGPUSetting,
  type KVConfig,
  type LLMLoadModelConfig,
} from "@lmstudio/lms-shared-types";
import { collapseKVStackRaw } from "../KVConfig.js";
import { llmLoadSchematics } from "../schema.js";

export function kvConfigToLLMLoadModelConfig(config: KVConfig): LLMLoadModelConfig {
  const result: LLMLoadModelConfig = {};
  const parsed = llmLoadSchematics.parse(config);

  const gpuSplitConfig = parsed.get("gpuSplitConfig");
  if (gpuSplitConfig !== undefined) {
    const gpuSetting = convertGPUSplitConfigToGPUSetting(gpuSplitConfig);
    result.gpu = gpuSetting;
  }

  const gpuStrictVramCap = parsed.get("gpuStrictVramCap");
  if (gpuStrictVramCap !== undefined) {
    result.gpuStrictVramCap = gpuStrictVramCap;
  }

  const offloadKVCacheToGpu = parsed.get("offloadKVCacheToGpu");
  if (offloadKVCacheToGpu !== undefined) {
    result.offloadKVCacheToGpu = offloadKVCacheToGpu;
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

  const evalBatchSize = parsed.get("llama.evalBatchSize");
  if (evalBatchSize !== undefined) {
    result.evalBatchSize = evalBatchSize;
  }

  const flashAttention = parsed.get("llama.flashAttention");
  if (flashAttention !== undefined) {
    result.flashAttention = flashAttention;
  }

  const keepModelInMemory = parsed.get("llama.keepModelInMemory");
  if (keepModelInMemory !== undefined) {
    result.keepModelInMemory = keepModelInMemory;
  }

  const seed = parsed.get("seed");
  if (seed !== undefined && seed.checked === true) {
    result.seed = seed.value;
  }

  const useFp16ForKVCache = parsed.get("llama.useFp16ForKVCache");
  if (useFp16ForKVCache !== undefined) {
    result.useFp16ForKVCache = useFp16ForKVCache;
  }

  const tryMmap = parsed.get("llama.tryMmap");
  if (tryMmap !== undefined) {
    result.tryMmap = tryMmap;
  }

  const numExperts = parsed.get("numExperts");
  if (numExperts !== undefined) {
    result.numExperts = numExperts;
  }

  const llamaKCacheQuantizationType = parsed.get("llama.kCacheQuantizationType");
  if (llamaKCacheQuantizationType !== undefined && llamaKCacheQuantizationType.checked === true) {
    result.llamaKCacheQuantizationType = llamaKCacheQuantizationType.value;
  }

  const llamaVCacheQuantizationType = parsed.get("llama.vCacheQuantizationType");
  if (llamaVCacheQuantizationType !== undefined && llamaVCacheQuantizationType.checked === true) {
    result.llamaVCacheQuantizationType = llamaVCacheQuantizationType.value;
  }

  return result;
}

export function llmLoadModelConfigToKVConfig(config: LLMLoadModelConfig): KVConfig {
  const top = llmLoadSchematics.buildPartialConfig({
    "gpuSplitConfig": convertGPUSettingToGPUSplitConfig(config.gpu),
    "gpuStrictVramCap": config.gpuStrictVramCap,
    "offloadKVCacheToGpu": config.offloadKVCacheToGpu,
    "contextLength": config.contextLength,
    "llama.ropeFrequencyBase":
      config.ropeFrequencyBase !== undefined
        ? { value: config.ropeFrequencyBase, checked: true }
        : undefined,
    "llama.ropeFrequencyScale":
      config.ropeFrequencyScale !== undefined
        ? { value: config.ropeFrequencyScale, checked: true }
        : undefined,
    "llama.evalBatchSize": config.evalBatchSize,
    "llama.flashAttention": config.flashAttention,
    "llama.keepModelInMemory": config.keepModelInMemory,
    "seed": config.seed !== undefined ? { value: config.seed, checked: true } : undefined,
    "llama.useFp16ForKVCache": config.useFp16ForKVCache,
    "llama.tryMmap": config.tryMmap,
    "numExperts": config.numExperts,
    "llama.kCacheQuantizationType":
      config.llamaKCacheQuantizationType !== undefined &&
      config.llamaKCacheQuantizationType !== false
        ? { value: config.llamaKCacheQuantizationType, checked: true }
        : undefined,
    "llama.vCacheQuantizationType":
      config.llamaVCacheQuantizationType !== undefined &&
      config.llamaVCacheQuantizationType !== false
        ? { value: config.llamaVCacheQuantizationType, checked: true }
        : undefined,
  });
  return collapseKVStackRaw([top]);
}
