import { z, type ZodSchema } from "zod";
import { kvConfigSchema, type KVConfig } from "./KVConfig.js";
import {
  modelCompatibilityTypeSchema,
  type ModelCompatibilityType,
} from "./ModelCompatibilityType.js";

/**
 * The indicator whether the virtual model is trained for tool use.
 * There could be cases where not all concrete models are trained for tool use.
 * In that case, we can use the "mixed" value to indicate that.
 */
export type VirtualModelTrainedForToolUse = true | false | "mixed";

const virtualModelTrainedForToolUseSchema = z.union([
  z.boolean(),
  z.literal("mixed"),
]) as ZodSchema<VirtualModelTrainedForToolUse>;

/**
 * The indicator whether the virtual model supports vision.
 * There could be cases where not all concrete models support vision.
 * In that case, we can use the "mixed" value to indicate that.
 */
export type VirtualModelVisionSupport = true | false | "mixed";

const virtualModelVisionSupportSchema = z.union([
  z.boolean(),
  z.literal("mixed"),
]) as ZodSchema<VirtualModelVisionSupport>;

/**
 * Allows the creator of a model to override certain metadata fields.
 */
export interface VirtualModelDefinitionMetadataOverrides {
  /**
   * Architectures of the model. e.g. llama, qwen2, etc.
   */
  architectures?: string[];
  /**
   * Model Compatibility types of the concrete models.
   */
  compatibilityTypes?: ModelCompatibilityType[];
  /**
   * The number of parameters in a short string format. e.g. 7B, 13B, 70B, etc.
   */
  paramsStrings?: string[];
  /**
   * The minimum required memory to load the model in bytes.
   */
  minMemoryUsageBytes?: number;
  /**
   * (LLM only) Whether the model is trained for tool use. Models that are trained for tool use
   * generally are more capable of using tools effectively. Could be a mixture of tool use and
   * non-tool use concrete models.
   */
  trainedForToolUse?: VirtualModelTrainedForToolUse;
  /**
   * (LLM only) Whether the model can take image inputs. Could be a mixture of image input and
   * non-image input concrete models.
   */
  vision?: VirtualModelVisionSupport;
}
export const virtualModelDefinitionMetadataOverridesSchema = z.object({
  architectures: z.array(z.string()).optional(),
  compatibilityTypes: z.array(modelCompatibilityTypeSchema).optional(),
  paramsStrings: z.array(z.string()).optional(),
  minMemoryUsageBytes: z.number().optional(),
  trainedForToolUse: virtualModelTrainedForToolUseSchema.optional(),
  vision: virtualModelVisionSupportSchema.optional(),
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
