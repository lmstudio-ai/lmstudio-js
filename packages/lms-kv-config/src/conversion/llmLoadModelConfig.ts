import {
  convertGPUSettingToGPUSplitConfig,
  convertGPUSplitConfigToGPUSetting,
  type GPUSetting,
  type KVConfig,
  type LLMLoadModelConfig,
  type ModelCompatibilityType,
} from "@lmstudio/lms-shared-types";
import { collapseKVStackRaw } from "../KVConfig.js";
import {
  llmLlamaMoeLoadConfigSchematics,
  llmLoadSchematics,
  llmMlxLoadConfigSchematics,
} from "../schema.js";
import { maybeFalseValueToCheckboxValue, maybeFalseValueToValue } from "./utils.js";

interface KvConfigToLLMLoadModelConfigOpts {
  /**
   * Fills the missing keys passed in with default values
   */
  useDefaultsForMissingKeys?: boolean;
  modelFormat?: ModelCompatibilityType;
}

function kvConfigToLLMLlamaLoadModelConfig(
  config: KVConfig,
  { useDefaultsForMissingKeys }: Omit<KvConfigToLLMLoadModelConfigOpts, "modelFormat"> = {},
): LLMLoadModelConfig {
  const result: LLMLoadModelConfig = {};

  let parsed;
  if (useDefaultsForMissingKeys === true) {
    parsed = llmLlamaMoeLoadConfigSchematics.parse(config);
  } else {
    parsed = llmLlamaMoeLoadConfigSchematics.parsePartial(config);
  }

  let gpuFields: GPUSetting = {};

  const gpuSplitConfig = parsed.get("load.gpuSplitConfig");
  if (gpuSplitConfig !== undefined) {
    gpuFields = {
      ...gpuFields,
      ...convertGPUSplitConfigToGPUSetting(gpuSplitConfig),
    };
    result.gpu = gpuFields;
  }

  const gpuStrictVramCap = parsed.get("load.gpuStrictVramCap");
  if (gpuStrictVramCap !== undefined) {
    result.gpuStrictVramCap = gpuStrictVramCap;
  }

  const llamaAccelerationOffloadRatio = parsed.get("llama.acceleration.offloadRatio");
  if (llamaAccelerationOffloadRatio !== undefined) {
    gpuFields = {
      ...gpuFields,
      ratio: llamaAccelerationOffloadRatio,
    };
    result.gpu = gpuFields;
  }

  const numCpuExpertLayersRatio = parsed.get("numCpuExpertLayersRatio");
  if (numCpuExpertLayersRatio !== undefined) {
    gpuFields = {
      ...gpuFields,
      numCpuExpertLayersRatio,
    };
    result.gpu = gpuFields;
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
  if (ropeFrequencyBase !== undefined) {
    result.ropeFrequencyBase = ropeFrequencyBase.checked ? ropeFrequencyBase.value : false;
  }

  const ropeFrequencyScale = parsed.get("llama.ropeFrequencyScale");
  if (ropeFrequencyScale !== undefined) {
    result.ropeFrequencyScale = ropeFrequencyScale.checked ? ropeFrequencyScale.value : false;
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
  if (seed !== undefined) {
    result.seed = seed.checked ? seed.value : false;
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
  if (llamaKCacheQuantizationType !== undefined) {
    result.llamaKCacheQuantizationType = llamaKCacheQuantizationType.checked
      ? llamaKCacheQuantizationType.value
      : false;
  }

  const llamaVCacheQuantizationType = parsed.get("llama.vCacheQuantizationType");
  if (llamaVCacheQuantizationType !== undefined) {
    result.llamaVCacheQuantizationType = llamaVCacheQuantizationType.checked
      ? llamaVCacheQuantizationType.value
      : false;
  }

  return result;
}

function kvConfigToLLMMlxLoadModelConfig(
  config: KVConfig,
  { useDefaultsForMissingKeys }: Omit<KvConfigToLLMLoadModelConfigOpts, "modelFormat"> = {},
): LLMLoadModelConfig {
  const result: LLMLoadModelConfig = {};

  let parsed;
  if (useDefaultsForMissingKeys === true) {
    parsed = llmMlxLoadConfigSchematics.parse(config);
  } else {
    parsed = llmMlxLoadConfigSchematics.parsePartial(config);
  }

  const contextLength = parsed.get("contextLength");
  if (contextLength !== undefined) {
    result.contextLength = contextLength;
  }

  const seed = parsed.get("seed");
  if (seed !== undefined) {
    result.seed = seed.checked ? seed.value : false;
  }
  const mlxKvCacheQuantization = parsed.get("mlx.kvCacheQuantization");
  if (mlxKvCacheQuantization !== undefined) {
    result.mlxKvCacheQuantization = mlxKvCacheQuantization.enabled ? mlxKvCacheQuantization : false;
  }

  return result;
}

export function kvConfigToLLMLoadModelConfig(
  config: KVConfig,
  // Default to gguf for backward compatibility
  { useDefaultsForMissingKeys, modelFormat = "gguf" }: KvConfigToLLMLoadModelConfigOpts = {},
): LLMLoadModelConfig {
  switch (modelFormat) {
    case "gguf":
      return kvConfigToLLMLlamaLoadModelConfig(config, {
        useDefaultsForMissingKeys,
      });
    case "safetensors":
      return kvConfigToLLMMlxLoadModelConfig(config, {
        useDefaultsForMissingKeys,
      });
    default:
      throw new Error(`Unsupported model format: ${modelFormat}`);
  }
}

export function llmLoadModelConfigToKVConfig(config: LLMLoadModelConfig): KVConfig {
  const top = llmLoadSchematics.buildPartialConfig({
    "gpuSplitConfig": convertGPUSettingToGPUSplitConfig(config.gpu),
    "gpuStrictVramCap": config.gpuStrictVramCap,
    "llama.acceleration.offloadRatio": config.gpu?.ratio,
    "numCpuExpertLayersRatio": config.gpu?.numCpuExpertLayersRatio,
    "offloadKVCacheToGpu": config.offloadKVCacheToGpu,
    "contextLength": config.contextLength,
    "llama.ropeFrequencyBase": maybeFalseValueToCheckboxValue(config.ropeFrequencyBase, 0),
    "llama.ropeFrequencyScale": maybeFalseValueToCheckboxValue(config.ropeFrequencyScale, 0),
    "llama.evalBatchSize": config.evalBatchSize,
    "llama.flashAttention": config.flashAttention,
    "llama.keepModelInMemory": config.keepModelInMemory,
    "seed": maybeFalseValueToCheckboxValue(config.seed, 0),
    "llama.useFp16ForKVCache": config.useFp16ForKVCache,
    "llama.tryMmap": config.tryMmap,
    "numExperts": config.numExperts,
    "llama.kCacheQuantizationType": maybeFalseValueToCheckboxValue(
      config.llamaKCacheQuantizationType,
      "f16",
    ),
    "llama.vCacheQuantizationType": maybeFalseValueToCheckboxValue(
      config.llamaVCacheQuantizationType,
      "f16",
    ),
    "mlx.kvCacheQuantization": maybeFalseValueToValue(config.mlxKvCacheQuantization, {
      enabled: false,
      bits: 8,
      groupSize: 64,
      quantizedStart: 5000,
    }),
  });
  return collapseKVStackRaw([top]);
}
