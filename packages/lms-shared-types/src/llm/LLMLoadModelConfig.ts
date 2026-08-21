import { z } from "zod";
import {
  llmLoadPromptTemplateSchema,
  type LLMLoadPromptTemplate,
} from "./LLMLoadPromptTemplate.js";

/**
 * How much of the model's work should be offloaded to the GPU. The value should be between 0 and 1.
 * A value of 0 means that no layers are offloaded to the GPU, while a value of 1 means that all
 * layers (that can be offloaded) are offloaded to the GPU.
 *
 * @public
 */
export type LLMLlamaAccelerationOffloadRatio = number | "max" | "off";
export const llmLlamaAccelerationOffloadRatioSchema = z.union([
  z.number().min(0).max(1),
  z.literal("max"),
  z.literal("off"),
]);

/**
 * How to split the model across GPUs.
 * - "evenly": Splits model evenly across GPUs
 * - "favorMainGpu": Fill the main GPU first, then fill the rest of the GPUs evenly
 *
 * @public
 * @deprecated We are currently working on an improved way to control split. You can use this for
 * now. We will offer the alternative before this feature is removed.
 */
export type LLMSplitStrategy = "evenly" | "favorMainGpu";
export const llmSplitStrategySchema = z.enum(["evenly", "favorMainGpu"]);

/**
 * Settings related to offloading work to the GPU.
 *
 * @public
 * @deprecated We are currently working on an improved way to control split. You can use this for
 * now. We will offer the alternative before this feature is removed.
 */
export type GPUSetting = {
  /**
   * A number between 0 to 1 representing the ratio of the work should be distributed to the GPU,
   * where 0 means no work is distributed and 1 means all work is distributed. Can also specify the
   * string "off" to mean 0 and the string "max" to mean 1.
   */
  ratio?: LLMLlamaAccelerationOffloadRatio;
  /**
   * A number between 0 to 1 representing the ratio of the layers whose expert blocks will be
   * forced into CPU memory, where 1 means all expert layers will be in CPU memory regardless of
   * GPU offload configuration and 0 means the expert offload will be determined by GPU offload.
   * Can also specify the string "off" to mean 0 and the string "max" to mean 1.
   */
  numCpuExpertLayersRatio?: LLMLlamaAccelerationOffloadRatio;
  /**
   * The index of the GPU to use as the main GPU.
   */
  mainGpu?: number;
  /**
   * How to split computation across multiple GPUs.
   */
  splitStrategy?: LLMSplitStrategy;
  /**
   * Indices of GPUs to disable.
   */
  disabledGpus?: number[];
};
export const gpuSettingSchema = z.object({
  ratio: llmLlamaAccelerationOffloadRatioSchema.optional(),
  numCpuExpertLayersRatio: llmLlamaAccelerationOffloadRatioSchema.optional(),
  mainGpu: z.number().int().optional(),
  splitStrategy: llmSplitStrategySchema.optional(),
  disabledGpus: z.array(z.number().int()).optional(),
});

export const llmLlamaCacheQuantizationTypes = [
  "f32",
  "f16",
  "q8_0",
  "q4_0",
  "q4_1",
  "iq4_nl",
  "q5_0",
  "q5_1",
] as const;
/**
 * TODO: Add documentation
 *
 * @public
 */
export type LLMLlamaCacheQuantizationType =
  | "f32"
  | "f16"
  | "q8_0"
  | "q4_0"
  | "q4_1"
  | "iq4_nl"
  | "q5_0"
  | "q5_1";
export const llmLlamaCacheQuantizationTypeSchema = z.enum(llmLlamaCacheQuantizationTypes);

// MLX KV cache quantization
export const llmMlxKvCacheBitsTypes = [8, 6, 4, 3, 2] as const;
/**
 * Allowed bit widths for MLX KV cache quantization.
 *
 * @public
 */
export type LLMMlxKvCacheBitsType = 8 | 6 | 4 | 3 | 2;
export const llmMlxKvCacheBitsTypeSchema = z.union([
  z.literal(8),
  z.literal(6),
  z.literal(4),
  z.literal(3),
  z.literal(2),
]);
export const llmMlxKvCacheGroupSizeTypes = [32, 64, 128] as const;
/**
 * Allowed group sizes for MLX KV cache quantization.
 *
 * @public
 */
export type LLMMlxKvCacheGroupSizeType = 32 | 64 | 128;
export const llmMlxKvCacheGroupSizeTypesSchema = z.union([
  z.literal(32),
  z.literal(64),
  z.literal(128),
]);
/**
 * Quantization settings for MLX KV cache.
 *
 * @public
 */
export type LLMMlxKvCacheQuantization = {
  enabled: boolean;
  bits: LLMMlxKvCacheBitsType;
  groupSize: LLMMlxKvCacheGroupSizeType;
  quantizedStart: number;
};
export const llmMlxKvCacheQuantizationSchema = z.object({
  enabled: z.boolean(),
  bits: llmMlxKvCacheBitsTypeSchema,
  groupSize: llmMlxKvCacheGroupSizeTypesSchema,
  quantizedStart: z.number().int().nonnegative(),
}) as z.Schema<LLMMlxKvCacheQuantization>;

/**
 * Flat load-time speculative decoding configuration.
 *
 * These fields are optional at request/config-write boundaries. Effective load configs may
 * materialize omitted booleans and resource strings to their schema defaults.
 *
 * @public
 * @experimental
 */
export interface LLMLoadSpeculativeDecodingConfig {
  speculativeDraftMtp?: boolean;
  /**
   * @deprecated External draft-model speculative decoding is now activated by
   * `speculativeDraftModel`. This field is accepted for compatibility and ignored by the resolver.
   */
  speculativeDraftSimple?: boolean;
  speculativeDraftModel?: string | false;
  speculativeDraftMaxTokens?: number;
  speculativeDraftMinTokens?: number;
  speculativeDraftMinContinueProbability?: number;
}

const speculativeDraftModelSchema = z.string().or(z.literal(false));
const speculativeDraftMtpSchema = z.boolean();
const speculativeDraftSimpleSchema = z.boolean();
const speculativeDraftTokenCountSchema = z.number().int().min(0);
const speculativeDraftMinContinueProbabilitySchema = z.number().min(0).max(1);

const speculativeDecodingScalarValidationSpecs: Array<{
  field: keyof LLMLoadSpeculativeDecodingConfig;
  schema: z.ZodTypeAny;
  message: string;
}> = [
  {
    field: "speculativeDraftMtp",
    schema: speculativeDraftMtpSchema,
    message: "speculativeDraftMtp must be a boolean",
  },
  {
    field: "speculativeDraftSimple",
    schema: speculativeDraftSimpleSchema,
    message: "speculativeDraftSimple must be a boolean",
  },
  {
    field: "speculativeDraftModel",
    schema: speculativeDraftModelSchema,
    message: "speculativeDraftModel must be a string or false",
  },
  {
    field: "speculativeDraftMaxTokens",
    schema: speculativeDraftTokenCountSchema,
    message: "speculativeDraftMaxTokens must be an integer greater than or equal to 0",
  },
  {
    field: "speculativeDraftMinTokens",
    schema: speculativeDraftTokenCountSchema,
    message: "speculativeDraftMinTokens must be an integer greater than or equal to 0",
  },
  {
    field: "speculativeDraftMinContinueProbability",
    schema: speculativeDraftMinContinueProbabilitySchema,
    message: "speculativeDraftMinContinueProbability must be between 0 and 1",
  },
];

/** @public @experimental */
export type LLMLoadSpeculativeDecodingResolution =
  | {
      type: "none";
      speculativeDraftMaxTokens?: number;
      speculativeDraftMinTokens?: number;
      speculativeDraftMinContinueProbability?: number;
    }
  | {
      type: "off";
      speculativeDraftMaxTokens?: number;
      speculativeDraftMinTokens?: number;
      speculativeDraftMinContinueProbability?: number;
    }
  | {
      type: "draftMtp";
      speculativeDraftModel?: string;
      speculativeDraftMaxTokens?: number;
      speculativeDraftMinTokens?: number;
      speculativeDraftMinContinueProbability?: number;
    }
  | {
      type: "draftSimple";
      speculativeDraftModel: string;
      speculativeDraftMaxTokens?: number;
      speculativeDraftMinTokens?: number;
      speculativeDraftMinContinueProbability?: number;
    };

interface LLMLoadSpeculativeDecodingValidationIssue {
  message: string;
  path: Array<string>;
}

function getLLMLoadSpeculativeDecodingScalarValidationIssues(
  config: LLMLoadSpeculativeDecodingConfig,
): Array<LLMLoadSpeculativeDecodingValidationIssue> {
  const issues: Array<LLMLoadSpeculativeDecodingValidationIssue> = [];

  for (const { field, schema, message } of speculativeDecodingScalarValidationSpecs) {
    const value = config[field];
    if (value !== undefined && !schema.safeParse(value).success) {
      issues.push({ message, path: [field] });
    }
  }

  return issues;
}

function hasActiveExternalDraftModel(
  speculativeDraftModel: LLMLoadSpeculativeDecodingConfig["speculativeDraftModel"],
): speculativeDraftModel is string {
  return typeof speculativeDraftModel === "string" && speculativeDraftModel.length > 0;
}

function getLLMLoadSpeculativeDecodingCrossFieldValidationIssues(
  {
    speculativeDraftMtp,
    speculativeDraftModel,
    speculativeDraftMaxTokens,
    speculativeDraftMinTokens,
  }: LLMLoadSpeculativeDecodingConfig,
  { rejectMtpExternalDraftConflict }: { rejectMtpExternalDraftConflict: boolean },
): Array<LLMLoadSpeculativeDecodingValidationIssue> {
  const issues: Array<LLMLoadSpeculativeDecodingValidationIssue> = [];
  const hasDraftModel = hasActiveExternalDraftModel(speculativeDraftModel);

  if (rejectMtpExternalDraftConflict && speculativeDraftMtp === true && hasDraftModel) {
    issues.push({
      message: "speculativeDraftMtp and speculativeDraftModel cannot both be enabled",
      path: ["speculativeDraftModel"],
    });
  }

  if (
    speculativeDraftMinTokens !== undefined &&
    speculativeDraftMaxTokens !== undefined &&
    speculativeDraftMinTokens > speculativeDraftMaxTokens
  ) {
    issues.push({
      message: "speculativeDraftMinTokens must be less than or equal to speculativeDraftMaxTokens",
      path: ["speculativeDraftMinTokens"],
    });
  }

  return issues;
}

function getLLMLoadSpeculativeDecodingValidationIssues(
  config: LLMLoadSpeculativeDecodingConfig,
): Array<LLMLoadSpeculativeDecodingValidationIssue> {
  return [
    ...getLLMLoadSpeculativeDecodingScalarValidationIssues(config),
    ...getLLMLoadSpeculativeDecodingCrossFieldValidationIssues(config, {
      rejectMtpExternalDraftConflict: true,
    }),
  ];
}

/**
 * Validate flat load-time speculative decoding fields.
 *
 * @public
 * @experimental
 */
export function validateLLMLoadSpeculativeDecodingConfig(
  config: LLMLoadSpeculativeDecodingConfig,
): void {
  const issues = getLLMLoadSpeculativeDecodingValidationIssues(config);
  if (issues.length > 0) {
    throw new Error(issues.map(issue => issue.message).join("; "));
  }
}

function resolveLLMLoadSpeculativeDecodingConfigInternal(
  config: LLMLoadSpeculativeDecodingConfig,
  { rejectMtpExternalDraftConflict }: { rejectMtpExternalDraftConflict: boolean },
): LLMLoadSpeculativeDecodingResolution {
  const issues = [
    ...getLLMLoadSpeculativeDecodingScalarValidationIssues(config),
    ...getLLMLoadSpeculativeDecodingCrossFieldValidationIssues(config, {
      rejectMtpExternalDraftConflict,
    }),
  ];
  if (issues.length > 0) {
    throw new Error(issues.map(issue => issue.message).join("; "));
  }

  const tuningFields = {
    speculativeDraftMaxTokens: config.speculativeDraftMaxTokens,
    speculativeDraftMinTokens: config.speculativeDraftMinTokens,
    speculativeDraftMinContinueProbability: config.speculativeDraftMinContinueProbability,
  };

  if (config.speculativeDraftMtp === true) {
    return {
      type: "draftMtp",
      ...tuningFields,
    };
  }

  if (hasActiveExternalDraftModel(config.speculativeDraftModel)) {
    return {
      type: "draftSimple",
      speculativeDraftModel: config.speculativeDraftModel,
      ...tuningFields,
    };
  }

  if (config.speculativeDraftModel === false) {
    return { type: "off", ...tuningFields };
  }

  return { type: "none", ...tuningFields };
}

/**
 * Resolve flat load-time speculative decoding fields into the effective local mode.
 *
 * This only interprets the fields present in the supplied config. It does not apply model defaults
 * or runtime-specific support checks.
 *
 * @public
 * @experimental
 */
export function resolveLLMLoadSpeculativeDecodingConfig(
  config: LLMLoadSpeculativeDecodingConfig,
): LLMLoadSpeculativeDecodingResolution {
  return resolveLLMLoadSpeculativeDecodingConfigInternal(config, {
    rejectMtpExternalDraftConflict: true,
  });
}

/**
 * Resolve already-collapsed effective load-time speculative decoding fields.
 *
 * Unlike the public request helper, this tolerates inert draft-model resource state when no
 * draft-family type is active. Runtime callers use this after config collapse, where provenance is
 * intentionally unavailable.
 *
 * @public
 * @experimental
 */
export function resolveEffectiveLLMLoadSpeculativeDecodingConfig(
  config: LLMLoadSpeculativeDecodingConfig,
): LLMLoadSpeculativeDecodingResolution {
  return resolveLLMLoadSpeculativeDecodingConfigInternal(config, {
    rejectMtpExternalDraftConflict: false,
  });
}

/** @public */
export interface LLMLoadModelConfig {
  /**
   * How to distribute the work to your GPUs. See {@link GPUSetting} for more information.
   *
   * @public
   * @deprecated We are currently working on an improved way to control split. You can use this for
   * now but expect breakage in the future.
   */
  gpu?: GPUSetting;

  /**
   * Maximum number of predictions the model can run at a given time. The speed of each individual
   * prediction may decrease with concurrency, but each prediction will start faster and higher
   * total throughput can be achieved.
   */
  maxParallelPredictions?: number;

  /**
   * Controls whether concurrent predictions share a single KV cache, saving memory. Disabling this
   * ensures each prediction can utilize the full context length, at the cost of using more memory.
   */
  useUnifiedKvCache?: boolean;

  /**
   * If set to true, detected system limits for VRAM will be strictly enforced. If a model + gpu
   * offload combination would exceed the detected available VRAM, model offload will be capped to
   * not exceed the available VRAM.
   *
   * @public
   */
  gpuStrictVramCap?: boolean;

  /**
   * If set to true, KV cache will be offloaded to GPU memory if available. If false, KV cache will
   * be loaded to RAM.
   *
   * @public
   */
  offloadKVCacheToGpu?: boolean;

  /**
   * The size of the context length in number of tokens. This will include both the prompts and the
   * responses. Once the context length is exceeded, the value set in
   * {@link LLMPredictionConfigBase#contextOverflowPolicy} is used to determine the behavior.
   *
   * See {@link LLMContextOverflowPolicy} for more information.
   */
  contextLength?: number;

  /**
   * Overrides the chat template used by engine-protocol llama-server runtimes at model load time.
   *
   * Absence means the runtime should use the resolved model/default template. Custom Jinja
   * templates are applied per loaded model instance and require a reload to change.
   *
   * @experimental
   */
  promptTemplate?: LLMLoadPromptTemplate;

  /**
   * Custom base frequency for rotary positional embeddings (RoPE).
   *
   * This advanced parameter adjusts how positional information is embedded in the model's
   * representations. Increasing this value may enable better performance at high context lengths by
   * modifying how the model processes position-dependent information.
   *
   * Set to false to disable custom base frequency.
   */
  ropeFrequencyBase?: number | false;

  /**
   * Scaling factor for RoPE (Rotary Positional Encoding) frequency.
   *
   * This factor scales the effective context window by modifying how positional information is
   * encoded. Higher values allow the model to handle longer contexts by making positional encoding
   * more granular, which can be particularly useful for extending a model beyond its original
   * training context length.
   *
   * Set to false to disable custom scaling.
   */
  ropeFrequencyScale?: number | false;

  /**
   * Number of input tokens to process together in a single batch during evaluation.
   *
   * Increasing this value typically improves processing speed and throughput by leveraging
   * parallelization, but requires more memory. Finding the optimal batch size often involves
   * balancing between performance gains and available hardware resources.
   */
  evalBatchSize?: number;

  /**
   * Maximum number of prompt tokens to process physically at a time.
   *
   * This advanced llama.cpp setting controls the physical batch size used for internal prompt
   * processing. It is clamped by the evaluation batch size.
   */
  physicalBatchSize?: number;

  /**
   * Enables Flash Attention for optimized attention computation.
   *
   * Flash Attention is an efficient implementation that reduces memory usage and speeds up
   * generation by optimizing how attention mechanisms are computed. This can significantly
   * improve performance on compatible hardware, especially for longer sequences.
   */
  flashAttention?: boolean;

  /**
   * Maximum number of llama-server context checkpoints to keep per slot.
   * Set to 0 to disable context checkpoints.
   */
  contextCheckpoints?: number;

  /**
   * Text inserted immediately before the chat-template-derived end-of-reasoning sequence when
   * llama.cpp ends reasoning because a reasoning budget is exhausted. The effective default is an
   * empty string. Changing this setting requires reloading the model.
   *
   * @experimental
   */
  reasoningBudgetMessage?: string;

  /**
   * Enables speculative decoding using bundled multi-token prediction heads when the loaded model
   * supports it.
   *
   * @experimental
   */
  speculativeDraftMtp?: boolean;

  /**
   * Deprecated compatibility flag for the previous Draft Simple selector. External draft-model
   * speculative decoding is now activated by `speculativeDraftModel`.
   *
   * @experimental
   * @deprecated Use `speculativeDraftModel` instead.
   */
  speculativeDraftSimple?: boolean;

  /**
   * Separate draft model resource to use for load-time speculative decoding. Set to `false` to
   * explicitly disable external draft-model speculative decoding.
   *
   * @experimental
   */
  speculativeDraftModel?: string | false;

  /**
   * Maximum number of draft tokens to generate.
   *
   * @experimental
   */
  speculativeDraftMaxTokens?: number;

  /**
   * Minimum draft length to verify with the main model.
   *
   * @experimental
   */
  speculativeDraftMinTokens?: number;

  /**
   * Minimum probability required to keep drafting additional tokens.
   *
   * @experimental
   */
  speculativeDraftMinContinueProbability?: number;

  /**
   * When enabled, prevents the model from being swapped out of system memory.
   *
   * This option reserves system memory for the model even when portions are offloaded to GPU,
   * ensuring faster access times when the model needs to be used. Improves performance
   * particularly for interactive applications, but increases overall RAM requirements.
   */
  keepModelInMemory?: boolean;

  /**
   * Random seed value for model initialization to ensure reproducible outputs.
   *
   * Setting a specific seed ensures that random operations within the model (like sampling)
   * produce the same results across different runs, which is important for reproducibility
   * in testing and development scenarios.
   *
   * Set to false to disable seeding - i.e. the output will be random.
   */
  seed?: number | false;

  /**
   * When enabled, stores the key-value cache in half-precision (FP16) format.
   *
   * This option significantly reduces memory usage during inference by using 16-bit floating
   * point numbers instead of 32-bit for the attention cache. While this may slightly reduce
   * numerical precision, the impact on output quality is generally minimal for most applications.
   */
  useFp16ForKVCache?: boolean;

  /**
   * Attempts to use memory-mapped (mmap) file access when loading the model.
   *
   * Memory mapping can improve initial load times by mapping model files directly from disk to
   * memory, allowing the operating system to handle paging. This is particularly beneficial for
   * quick startup, but may reduce performance if the model is larger than available system RAM,
   * causing frequent disk access.
   */
  tryMmap?: boolean;

  /**
   * Attempts to use direct I/O (O_DIRECT) to read model files, bypassing the OS page cache.
   *
   * Direct I/O transfers data straight between disk and application memory without copying through
   * the kernel's page cache. This may improve load performance on certain hardware devices. Even
   * when enabled, direct I/O may not be used if the platform or OS does not support it.
   */
  tryDirectIO?: boolean;

  /**
   * Specifies the number of experts to use for models with Mixture of Experts (MoE) architecture.
   *
   * MoE models contain multiple "expert" networks that specialize in different aspects of the task.
   * This parameter controls how many of these experts are active during inference, affecting both
   * performance and quality of outputs. Only applicable for models designed with the MoE
   * architecture.
   */
  numExperts?: number;
  /**
   * Quantization type for the Llama model's key cache.
   *
   * This option determines the precision level used to store the key component of the attention
   * mechanism's cache. Lower precision values (e.g., 4-bit or 8-bit quantization) significantly
   * reduce memory usage during inference but may slightly impact output quality. The effect varies
   * between different models, with some being more robust to quantization than others.
   *
   * Set to false to disable quantization and use full precision.
   */
  llamaKCacheQuantizationType?: LLMLlamaCacheQuantizationType | false;

  /**
   * Quantization type for the Llama model's value cache.
   *
   * Similar to the key cache quantization, this option controls the precision used for the value
   * component of the attention mechanism's cache. Reducing precision saves memory but may affect
   * generation quality. This option requires Flash Attention to be enabled to function properly.
   *
   * Different models respond differently to value cache quantization, so experimentation may be
   * needed to find the optimal setting for a specific use case. Set to false to disable
   * quantization.
   *
   * Requires Flash Attention to be enabled to function properly.
   *
   * Set to false to disable quantization and use full precision.
   */
  llamaVCacheQuantizationType?: LLMLlamaCacheQuantizationType | false;

  /**
   * Whether MLX should store reusable prompt states on disk. Disable this to keep prompt caching
   * in memory only.
   */
  mlxDiskCache?: boolean;

  /**
   * Quantization settings for the MLX model's key-value cache.
   *
   * Similar to Llama cache quantization, this option allows for reducing the precision of the
   * key-value cache used in attention mechanisms, which can significantly decrease memory usage
   * during inference. The quantization settings include the number of bits used, group size, and
   * the starting point for quantization.
   *
   * Reducing precision can impact output quality, and the effect varies between different models.
   * Experimentation may be necessary to find the optimal quantization settings for a specific
   * model and use case.
   *
   * Set to false to disable quantization and use full precision.
   */
  mlxKvCacheQuantization?: LLMMlxKvCacheQuantization | false;
}
export const llmLoadModelConfigSchema = z
  .object({
    gpu: gpuSettingSchema.optional(),
    maxParallelPredictions: z.number().int().min(1).optional(),
    useUnifiedKvCache: z.boolean().optional(),
    gpuStrictVramCap: z.boolean().optional(),
    offloadKVCacheToGpu: z.boolean().optional(),
    contextLength: z.number().int().min(1).optional(),
    promptTemplate: llmLoadPromptTemplateSchema.optional(),
    ropeFrequencyBase: z.number().or(z.literal(false)).optional(),
    ropeFrequencyScale: z.number().or(z.literal(false)).optional(),
    evalBatchSize: z.number().int().min(1).optional(),
    physicalBatchSize: z.number().int().min(1).optional(),
    flashAttention: z.boolean().optional(),
    contextCheckpoints: z.number().int().min(0).optional(),
    reasoningBudgetMessage: z.string().optional(),
    speculativeDraftMtp: speculativeDraftMtpSchema.optional(),
    speculativeDraftSimple: speculativeDraftSimpleSchema.optional(),
    speculativeDraftModel: speculativeDraftModelSchema.optional(),
    speculativeDraftMaxTokens: speculativeDraftTokenCountSchema.optional(),
    speculativeDraftMinTokens: speculativeDraftTokenCountSchema.optional(),
    speculativeDraftMinContinueProbability: speculativeDraftMinContinueProbabilitySchema.optional(),
    keepModelInMemory: z.boolean().optional(),
    seed: z.number().int().or(z.literal(false)).optional(),
    useFp16ForKVCache: z.boolean().optional(),
    tryMmap: z.boolean().optional(),
    tryDirectIO: z.boolean().optional(),
    numExperts: z.number().int().optional(),
    llamaKCacheQuantizationType: z
      .enum(llmLlamaCacheQuantizationTypes)
      .or(z.literal(false))
      .optional(),
    llamaVCacheQuantizationType: z
      .enum(llmLlamaCacheQuantizationTypes)
      .or(z.literal(false))
      .optional(),
    mlxDiskCache: z.boolean().optional(),
    mlxKvCacheQuantization: llmMlxKvCacheQuantizationSchema.or(z.literal(false)).optional(),
  })
  .superRefine((config, context) => {
    for (const issue of getLLMLoadSpeculativeDecodingCrossFieldValidationIssues(config, {
      rejectMtpExternalDraftConflict: true,
    })) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: issue.message,
        path: issue.path,
      });
    }
  });
