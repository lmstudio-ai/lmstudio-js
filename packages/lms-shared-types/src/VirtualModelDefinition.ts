import { z, type ZodSchema } from "zod";
import { kvConfigSchema, type KVConfig } from "./KVConfig.js";

/**
 * Allows the creator of a model to override certain metadata fields.
 */
export interface VirtualModelDefinitionMetadataOverrides {
  /**
   * Architecture of the model. e.g. llama, qwen2, etc.
   */
  architecture?: string;
  /**
   * The number of parameters in a short string format. e.g. 7B, 13B, 70B, etc.
   */
  paramsString?: string;
  /**
   * The minimum required memory to load the model in bytes.
   */
  minMemoryUsageBytes?: number;
  /**
   * (LLM only) Whether the model is trained for tool use. Models that are trained for tool use
   * generally are more capable of using tools effectively.
   */
  trainedForToolUse?: boolean;
  /**
   * (LLM only) Whether the model can take image inputs.
   */
  vision?: boolean;
}
export const virtualModelDefinitionMetadataOverridesSchema = z.object({
  architecture: z.string().optional(),
  paramsString: z.string().optional(),
  minMemoryUsageBytes: z.number().optional(),
  trainedForToolUse: z.boolean().optional(),
  vision: z.boolean().optional(),
}) as ZodSchema<VirtualModelDefinitionMetadataOverrides>;

export interface VirtualModelDefinition {
  /**
   * The self proclaimed indexed model identifier. Should always be in the shape of user/repo.
   */
  model: string;
  /**
   * The model key of the next model in the inheritance chain. If multiple models are matched,
   * LM Studio will pick the best one based on hardware and installed engines.
   *
   * If an array is provided, any model matching any of the model keys will be considered.
   */
  base: string | Array<string>;
  config?: {
    load?: KVConfig;
    operation?: KVConfig;
  };
  metadataOverrides?: VirtualModelDefinitionMetadataOverrides;
}
export const virtualModelDefinitionSchema = z.object({
  model: z.string().regex(/^[^/]+\/[^/]+$/),
  base: z.string().or(z.array(z.string())),
  config: z
    .object({
      load: kvConfigSchema.optional(),
      operation: kvConfigSchema.optional(),
    })
    .optional(),
  metadataOverrides: virtualModelDefinitionMetadataOverridesSchema.optional(),
}) as ZodSchema<VirtualModelDefinition>;
