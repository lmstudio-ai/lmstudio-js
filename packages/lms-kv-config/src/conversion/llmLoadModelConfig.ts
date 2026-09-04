import {
  convertGPUSettingToGPUSplitConfig,
  convertGPUSplitConfigToGPUSetting,
  type GPUSplitConfig,
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
  llmVllmLoadConfigSchematics,
} from "../schema.js";
import { maybeFalseValueToCheckboxValue, maybeFalseValueToValue } from "./utils.js";

interface KvConfigToLLMLoadModelConfigOpts {
  /**
   * Fills the missing keys passed in with default values
   */
  useDefaultsForMissingKeys?: boolean;
  modelFormat?: ModelCompatibilityType;
}

/** Converts GGUF load fields back to the public SDK shape, optionally materializing defaults. */
function kvConfigToLLMLlamaLoadModelConfig(
  config: KVConfig,
  { useDefaultsForMissingKeys }: Omit<KvConfigToLLMLoadModelConfigOpts, "modelFormat"> = {},
): LLMLoadModelConfig {
  const result: LLMLoadModelConfig = {};

  let parsed;
  const partialParsed = llmLlamaMoeLoadConfigSchematics.parsePartial(config);
  if (useDefaultsForMissingKeys === true) {
    parsed = llmLlamaMoeLoadConfigSchematics.parse(config);
  } else {
    parsed = partialParsed;
  }

  const explicitAutoFit = partialParsed.get("llama.autoFit");
  const explicitGpuSplitConfig = partialParsed.get("load.gpuSplitConfig");
  // Older SDKs wrote manual fields without disabling AutoFit, so inspect them before defaults fill it.
  const hasLegacyManualLoadSetting =
    explicitAutoFit === undefined &&
    (partialParsed.get("contextLength") !== undefined ||
      partialParsed.get("load.gpuStrictVramCap") !== undefined ||
      partialParsed.get("llama.acceleration.offloadRatio") !== undefined ||
      partialParsed.get("numCpuExpertLayersRatio") !== undefined ||
      (explicitGpuSplitConfig !== undefined &&
        (explicitGpuSplitConfig.strategy !== "evenly" ||
          explicitGpuSplitConfig.disabledGpus.length === 0 ||
          explicitGpuSplitConfig.priority.length > 0 ||
          explicitGpuSplitConfig.customRatio.length > 0)));
  const autoFit = hasLegacyManualLoadSetting ? false : parsed.get("llama.autoFit");
  if (autoFit !== undefined) {
    result.autoFit = autoFit;
  }

  let gpuFields: GPUSetting = {};

  const gpuSplitConfig = parsed.get("load.gpuSplitConfig");
  if (gpuSplitConfig !== undefined) {
    const convertedGPUSetting = convertGPUSplitConfigToGPUSetting(gpuSplitConfig);
    // Without explicit manual mode, the KV strategy may only be a default added for GPU filters.
    if (autoFit !== false) {
      if (convertedGPUSetting.disabledGpus !== undefined) {
        gpuFields = { disabledGpus: convertedGPUSetting.disabledGpus };
        result.gpu = gpuFields;
      }
    } else {
      gpuFields = { ...gpuFields, ...convertedGPUSetting };
      result.gpu = gpuFields;
    }
  }

  const gpuStrictVramCap = parsed.get("load.gpuStrictVramCap");
  if (autoFit !== true && gpuStrictVramCap !== undefined) {
    result.gpuStrictVramCap = gpuStrictVramCap;
  }

  const llamaAccelerationOffloadRatio = parsed.get("llama.acceleration.offloadRatio");
  if (autoFit !== true && llamaAccelerationOffloadRatio !== undefined) {
    gpuFields = {
      ...gpuFields,
      ratio: llamaAccelerationOffloadRatio,
    };
    result.gpu = gpuFields;
  }

  const numCpuExpertLayersRatio = parsed.get("numCpuExpertLayersRatio");
  if (autoFit !== true && numCpuExpertLayersRatio !== undefined) {
    gpuFields = {
      ...gpuFields,
      numCpuExpertLayersRatio,
    };
    result.gpu = gpuFields;
  }

  const maxParallelPredictions = parsed.get("numParallelSessions");
  if (maxParallelPredictions !== undefined) {
    result.maxParallelPredictions = maxParallelPredictions;
  }

  const useUnifiedKvCache = parsed.get("useUnifiedKvCache");
  if (useUnifiedKvCache !== undefined) {
    result.useUnifiedKvCache = useUnifiedKvCache;
  }

  const offloadKVCacheToGpu = parsed.get("offloadKVCacheToGpu");
  if (offloadKVCacheToGpu !== undefined) {
    result.offloadKVCacheToGpu = offloadKVCacheToGpu;
  }

  const contextLength = parsed.get("contextLength");
  if (autoFit !== true && contextLength !== undefined) {
    result.contextLength = contextLength;
  }

  const promptTemplate = partialParsed.get("promptTemplate");
  if (promptTemplate !== undefined) {
    result.promptTemplate = promptTemplate;
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

  const physicalBatchSize = parsed.get("llama.physicalBatchSize");
  if (physicalBatchSize !== undefined) {
    result.physicalBatchSize = physicalBatchSize;
  }

  const flashAttention = parsed.get("llama.flashAttention");
  if (flashAttention !== undefined) {
    result.flashAttention = flashAttention;
  }

  const contextCheckpoints = parsed.get("llama.contextCheckpoints");
  if (contextCheckpoints !== undefined) {
    result.contextCheckpoints = contextCheckpoints;
  }

  const reasoningBudgetMessage = parsed.get("llama.reasoningBudgetMessage");
  if (reasoningBudgetMessage !== undefined) {
    result.reasoningBudgetMessage = reasoningBudgetMessage;
  }

  const speculativeDraftMtp = parsed.get("llama.speculativeDecoding.draftMtp");
  if (speculativeDraftMtp !== undefined) {
    result.speculativeDraftMtp = speculativeDraftMtp;
  }

  const speculativeDraftSimple = parsed.get("llama.speculativeDecoding.draftSimple");
  if (speculativeDraftSimple !== undefined) {
    result.speculativeDraftSimple = speculativeDraftSimple;
  }

  const speculativeDraftModel = parsed.get("llama.speculativeDecoding.draftModel");
  if (speculativeDraftModel !== undefined) {
    // Materialized public configs must be valid if passed back to client.llm.load(). Keep stale
    // draft-model resources internal unless Draft Simple currently consumes them.
    result.speculativeDraftModel =
      useDefaultsForMissingKeys === true && speculativeDraftSimple !== true
        ? ""
        : speculativeDraftModel;
  }

  const speculativeDraftMaxTokens = parsed.get("llama.speculativeDecoding.draftMaxTokens");
  if (speculativeDraftMaxTokens !== undefined) {
    result.speculativeDraftMaxTokens = speculativeDraftMaxTokens;
  }

  const speculativeDraftMinTokens = parsed.get("llama.speculativeDecoding.draftMinTokens");
  if (speculativeDraftMinTokens !== undefined) {
    result.speculativeDraftMinTokens = speculativeDraftMinTokens;
  }

  const speculativeDraftMinContinueProbability = parsed.get(
    "llama.speculativeDecoding.draftMinContinueProbability",
  );
  if (speculativeDraftMinContinueProbability !== undefined) {
    result.speculativeDraftMinContinueProbability = speculativeDraftMinContinueProbability;
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

  const tryDirectIO = parsed.get("llama.tryDirectIO");
  if (tryDirectIO !== undefined) {
    result.tryDirectIO = tryDirectIO;
  }

  const llamaCppArgumentsOverride = parsed.get("llama.argumentsOverride");
  if (llamaCppArgumentsOverride !== undefined) {
    result.llamaCppArgumentsOverride = llamaCppArgumentsOverride;
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

/** Converts MLX load fields back to the public SDK shape, optionally materializing defaults. */
function kvConfigToLLMMlxLoadModelConfig(
  config: KVConfig,
  { useDefaultsForMissingKeys }: Omit<KvConfigToLLMLoadModelConfigOpts, "modelFormat"> = {},
): LLMLoadModelConfig {
  const result: LLMLoadModelConfig = {};

  let parsed;
  const partialParsed = llmMlxLoadConfigSchematics.parsePartial(config);
  if (useDefaultsForMissingKeys === true) {
    parsed = llmMlxLoadConfigSchematics.parse(config);
  } else {
    parsed = partialParsed;
  }

  // Older SDKs wrote a manual context without disabling AutoFit.
  const autoFit =
    partialParsed.get("mlx.autoFit") === undefined &&
    partialParsed.get("contextLength") !== undefined
      ? false
      : parsed.get("mlx.autoFit");
  if (autoFit !== undefined) {
    result.autoFit = autoFit;
  }

  const contextLength = parsed.get("contextLength");
  if (autoFit !== true && contextLength !== undefined) {
    result.contextLength = contextLength;
  }

  const seed = parsed.get("seed");
  if (seed !== undefined) {
    result.seed = seed.checked ? seed.value : false;
  }
  const maxParallelPredictions = parsed.get("numParallelSessions");
  if (maxParallelPredictions !== undefined) {
    result.maxParallelPredictions = maxParallelPredictions;
  }
  const mlxDiskCache = parsed.get("mlx.diskCache");
  if (mlxDiskCache !== undefined) {
    result.mlxDiskCache = mlxDiskCache;
  }
  const mlxKvCacheQuantization = parsed.get("mlx.kvCacheQuantization");
  if (mlxKvCacheQuantization !== undefined) {
    result.mlxKvCacheQuantization = mlxKvCacheQuantization.enabled ? mlxKvCacheQuantization : false;
  }

  return result;
}

function convertVllmGPUSplitConfigToGPUSetting(
  splitConfig: GPUSplitConfig,
): GPUSetting | undefined {
  if (splitConfig.strategy !== "custom") {
    return convertGPUSplitConfigToGPUSetting(splitConfig);
  }

  const selectedGpuIds = splitConfig.customRatio.flatMap((ratio, gpuId) =>
    ratio > 0 ? [gpuId] : [],
  );
  const selectedGpuId = selectedGpuIds[0];
  if (selectedGpuIds.length !== 1 || selectedGpuId === undefined) {
    return undefined;
  }

  return {
    splitStrategy: "favorMainGpu",
    mainGpu: selectedGpuId,
  };
}

/** Converts vLLM load fields back to the public SDK shape, optionally materializing defaults. */
function kvConfigToLLMVllmLoadModelConfig(
  config: KVConfig,
  { useDefaultsForMissingKeys }: Omit<KvConfigToLLMLoadModelConfigOpts, "modelFormat"> = {},
): LLMLoadModelConfig {
  const result: LLMLoadModelConfig = {};
  const partialParsed = llmVllmLoadConfigSchematics.parsePartial(config);
  const parsed =
    useDefaultsForMissingKeys === true ? llmVllmLoadConfigSchematics.parse(config) : partialParsed;

  const gpuSplitConfig = partialParsed.get("load.gpuSplitConfig");
  if (gpuSplitConfig !== undefined) {
    const gpuSetting = convertVllmGPUSplitConfigToGPUSetting(gpuSplitConfig);
    if (gpuSetting !== undefined) {
      result.gpu = gpuSetting;
    }
  }

  const maxParallelPredictions = parsed.get("numParallelSessions");
  if (maxParallelPredictions !== undefined) {
    result.maxParallelPredictions = maxParallelPredictions;
  }

  const contextLength = parsed.get("contextLength");
  if (contextLength !== undefined) {
    result.contextLength = contextLength;
  }

  const promptTemplate = partialParsed.get("promptTemplate");
  if (promptTemplate !== undefined) {
    result.promptTemplate = promptTemplate;
  }

  const seed = parsed.get("seed");
  if (seed !== undefined) {
    result.seed = seed.checked ? seed.value : false;
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
    case "torch_safetensors":
      return kvConfigToLLMVllmLoadModelConfig(config, {
        useDefaultsForMissingKeys,
      });
    default:
      throw new Error(`Unsupported model format: ${modelFormat}`);
  }
}

/** Converts a public SDK load request into the KV layer consumed by model loading. */
export function llmLoadModelConfigToKVConfig(config: LLMLoadModelConfig): KVConfig {
  // This conversion currently exposes only the existing speculative selectors. Support for
  // the new drafter modes will be added to public load config separately. Until then, when a public
  // caller explicitly writes one of the public selectors, clear the new internal selectors in the same
  // KV layer so that request stays atomic and cannot inherit lower-layer modes after KV collapse.
  const publicSpeculativeSelectorIsSpecified =
    config.speculativeDraftMtp !== undefined ||
    config.speculativeDraftSimple !== undefined ||
    config.speculativeDraftModel !== undefined;
  const hasManualLoadSetting =
    config.contextLength !== undefined ||
    config.gpu?.ratio !== undefined ||
    config.gpu?.numCpuExpertLayersRatio !== undefined ||
    config.gpu?.mainGpu !== undefined ||
    config.gpu?.splitStrategy !== undefined ||
    config.gpuStrictVramCap !== undefined;
  const autoFit = config.autoFit ?? (hasManualLoadSetting ? false : undefined);
  const hasGpuSplitSetting =
    (config.gpu?.disabledGpus !== undefined && config.gpu.disabledGpus.length > 0) ||
    config.gpu?.mainGpu !== undefined ||
    config.gpu?.splitStrategy !== undefined;

  const top = llmLoadSchematics.buildPartialConfig({
    "llama.autoFit": autoFit,
    "mlx.autoFit": autoFit,
    "gpuSplitConfig": hasGpuSplitSetting
      ? convertGPUSettingToGPUSplitConfig(config.gpu)
      : undefined,
    "gpuStrictVramCap": config.gpuStrictVramCap,
    "llama.acceleration.offloadRatio": config.gpu?.ratio,
    "numCpuExpertLayersRatio": config.gpu?.numCpuExpertLayersRatio,
    "numParallelSessions": config.maxParallelPredictions,
    "useUnifiedKvCache": config.useUnifiedKvCache,
    "offloadKVCacheToGpu": config.offloadKVCacheToGpu,
    "contextLength": config.contextLength,
    "promptTemplate": config.promptTemplate,
    "llama.ropeFrequencyBase": maybeFalseValueToCheckboxValue(config.ropeFrequencyBase, 0),
    "llama.ropeFrequencyScale": maybeFalseValueToCheckboxValue(config.ropeFrequencyScale, 0),
    "llama.evalBatchSize": config.evalBatchSize,
    "llama.physicalBatchSize": config.physicalBatchSize,
    "llama.flashAttention": config.flashAttention,
    "llama.contextCheckpoints": config.contextCheckpoints,
    "llama.reasoningBudgetMessage": config.reasoningBudgetMessage,
    "llama.speculativeDecoding.draftMtp": config.speculativeDraftMtp,
    "llama.speculativeDecoding.draftSimple": config.speculativeDraftSimple,
    ...(publicSpeculativeSelectorIsSpecified
      ? {
          "llama.speculativeDecoding.draftDflashSidecar": false,
          "llama.speculativeDecoding.draftDsparkSidecar": false,
          "llama.speculativeDecoding.draftMtpSidecar": false,
        }
      : {}),
    "llama.speculativeDecoding.draftModel": config.speculativeDraftModel,
    "llama.speculativeDecoding.draftMaxTokens": config.speculativeDraftMaxTokens,
    "llama.speculativeDecoding.draftMinTokens": config.speculativeDraftMinTokens,
    "llama.speculativeDecoding.draftMinContinueProbability":
      config.speculativeDraftMinContinueProbability,
    "llama.keepModelInMemory": config.keepModelInMemory,
    "seed": maybeFalseValueToCheckboxValue(config.seed, 0),
    "llama.useFp16ForKVCache": config.useFp16ForKVCache,
    "llama.tryMmap": config.tryMmap,
    "llama.tryDirectIO": config.tryDirectIO,
    "llama.argumentsOverride": config.llamaCppArgumentsOverride,
    "numExperts": config.numExperts,
    "llama.kCacheQuantizationType": maybeFalseValueToCheckboxValue(
      config.llamaKCacheQuantizationType,
      "f16",
    ),
    "llama.vCacheQuantizationType": maybeFalseValueToCheckboxValue(
      config.llamaVCacheQuantizationType,
      "f16",
    ),
    "mlx.diskCache": config.mlxDiskCache,
    "mlx.kvCacheQuantization": maybeFalseValueToValue(config.mlxKvCacheQuantization, {
      enabled: false,
      bits: 8,
      groupSize: 64,
      quantizedStart: 5000,
    }),
  });
  return collapseKVStackRaw([top]);
}
