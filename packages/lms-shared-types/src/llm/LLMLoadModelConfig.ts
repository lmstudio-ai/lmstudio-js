import { z } from "zod";

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
export type LLMMlxKvCacheBitsType = (typeof llmMlxKvCacheBitsTypes)[number];
export const llmMlxKvCacheBitsTypeSchema = z.union([
  z.literal(8),
  z.literal(6),
  z.literal(4),
  z.literal(3),
  z.literal(2),
]);
export const llmMlxKvCacheGroupSizeTypes = [32, 64, 128] as const;
export type LLMMlxKvCacheGroupSizeType = (typeof llmMlxKvCacheGroupSizeTypes)[number];
export const llmMlxKvCacheGroupSizeTypesSchema = z.union([
  z.literal(32),
  z.literal(64),
  z.literal(128),
]);
export const llmMlxKvCacheQuantizationSchema = z.object({
  enabled: z.boolean(),
  bits: llmMlxKvCacheBitsTypeSchema,
  groupSize: llmMlxKvCacheGroupSizeTypesSchema,
  quantizedStart: z.number().int().nonnegative(),
});

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
   * Enables Flash Attention for optimized attention computation.
   *
   * Flash Attention is an efficient implementation that reduces memory usage and speeds up
   * generation by optimizing how attention mechanisms are computed. This can significantly
   * improve performance on compatible hardware, especially for longer sequences.
   */
  flashAttention?: boolean;

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
}
export const llmLoadModelConfigSchema = z.object({
  gpu: gpuSettingSchema.optional(),
  gpuStrictVramCap: z.boolean().optional(),
  offloadKVCacheToGpu: z.boolean().optional(),
  contextLength: z.number().int().min(1).optional(),
  ropeFrequencyBase: z.number().or(z.literal(false)).optional(),
  ropeFrequencyScale: z.number().or(z.literal(false)).optional(),
  evalBatchSize: z.number().int().min(1).optional(),
  flashAttention: z.boolean().optional(),
  keepModelInMemory: z.boolean().optional(),
  seed: z.number().int().or(z.literal(false)).optional(),
  useFp16ForKVCache: z.boolean().optional(),
  tryMmap: z.boolean().optional(),
  numExperts: z.number().int().optional(),
  llamaKCacheQuantizationType: z
    .enum(llmLlamaCacheQuantizationTypes)
    .or(z.literal(false))
    .optional(),
  llamaVCacheQuantizationType: z
    .enum(llmLlamaCacheQuantizationTypes)
    .or(z.literal(false))
    .optional(),
});
