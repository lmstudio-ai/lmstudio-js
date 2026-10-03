import { z } from "zod";
import { llmLoadModelConfigSchema, type LLMLoadModelConfig } from "../llm/LLMLoadModelConfig.js";

/** Decision lifecycle load controls. No chat or inference configuration. @public */
export const decisionLoadModelConfigSchema: z.ZodEffects<z.ZodType<DecisionLoadModelConfig>> =
  llmLoadModelConfigSchema
    .innerType()
    .pick({
      gpu: true,
      autoFit: true,
      contextLength: true,
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
    })
    .superRefine((config, context) => {
      const validation = llmLoadModelConfigSchema.safeParse(config);
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
    | "contextLength"
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
  autoFitMinContextLength?: number;
}
