import { z } from "zod";
import { gpuSettingSchema, type GPUSetting } from "../llm/LLMLoadModelConfig.js";

/**
 * @public
 */
export interface EmbeddingLoadModelConfig {
  // TODO: Fix type
  gpu?: GPUSetting;
  contextLength?: number;
  ropeFrequencyBase?: number | false;
  ropeFrequencyScale?: number | false;
  keepModelInMemory?: boolean;
  tryMmap?: boolean;
}
export const embeddingLoadModelConfigSchema = z.object({
  gpu: gpuSettingSchema.optional(),
  contextLength: z.number().int().min(1).optional(),
  ropeFrequencyBase: z.number().or(z.literal(false)).optional(),
  ropeFrequencyScale: z.number().or(z.literal(false)).optional(),
  keepModelInMemory: z.boolean().optional(),
  tryMmap: z.boolean().optional(),
});
