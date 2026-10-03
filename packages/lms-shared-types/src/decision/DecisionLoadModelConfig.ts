import { z } from "zod";
import { llmLoadModelConfigSchema, type LLMLoadModelConfig } from "../llm/LLMLoadModelConfig.js";

/** Decision lifecycle load controls. No chat or inference configuration. @public */
export const decisionLoadModelConfigSchema: z.ZodEffects<z.ZodType<DecisionLoadModelConfig>> =
  llmLoadModelConfigSchema
    .innerType()
    .pick({
      gpu: true,
      autoFit: true,
      maxParallelPredictions: true,
      useUnifiedKvCache: true,
      gpuStrictVramCap: true,
      offloadKVCacheToGpu: true,
      ropeFrequencyBase: true,
      ropeFrequencyScale: true,
      evalBatchSize: true,
      physicalBatchSize: true,
      flashAttention: true,
      keepModelInMemory: true,
      seed: true,
      useFp16ForKVCache: true,
      tryMmap: true,
      tryDirectIO: true,
      llamaCppArgumentsOverride: true,
      numExperts: true,
      llamaKCacheQuantizationType: true,
      llamaVCacheQuantizationType: true,
    })
    .extend({
      autoFitMinContextLength: z.number().int().min(0).optional(),
      /** 0 delegates context sizing to the engine. Loaded info reports actual context. */
      contextLength: z.number().int().min(0).optional(),
    })
    .superRefine((config, context) => {
      // Reuse the shared GGUF cross-field rules; 0 is a decision engine-default sentinel.
      const validation = llmLoadModelConfigSchema.safeParse({
        ...config,
        contextLength: config.contextLength === 0 ? 1 : config.contextLength,
      });
      if (!validation.success) {
        for (const issue of validation.error.issues) {
          context.addIssue(issue);
        }
      }
    });
/** Decision lifecycle controls reuse GGUF field types without exposing chat configuration. @public */
export interface DecisionLoadModelConfig
  extends Pick<
    LLMLoadModelConfig,
    | "gpu"
    | "autoFit"
    | "maxParallelPredictions"
    | "useUnifiedKvCache"
    | "gpuStrictVramCap"
    | "offloadKVCacheToGpu"
    | "ropeFrequencyBase"
    | "ropeFrequencyScale"
    | "evalBatchSize"
    | "physicalBatchSize"
    | "flashAttention"
    | "keepModelInMemory"
    | "seed"
    | "useFp16ForKVCache"
    | "tryMmap"
    | "tryDirectIO"
    | "llamaCppArgumentsOverride"
    | "numExperts"
    | "llamaKCacheQuantizationType"
    | "llamaVCacheQuantizationType"
  > {
  /** 0 delegates context sizing to the engine; loaded info reports actual context. */
  contextLength?: number;
  autoFitMinContextLength?: number;
}
