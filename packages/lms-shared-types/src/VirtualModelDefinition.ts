import { z, type ZodSchema } from "zod";
import { kvConfigSchema, type KVConfig } from "./KVConfig.js";
import {
  modelCompatibilityTypeSchema,
  type ModelCompatibilityType,
} from "./ModelCompatibilityType.js";
import { modelDomainTypeSchema, type ModelDomainType } from "./ModelDomainType.js";
import { modelDownloadSourceSchema, type ModelDownloadSource } from "./ModelDownloadSource.js";

/**
 * The indicator whether the virtual model is trained for tool use. There could be cases where not
 * all concrete models are trained for tool use. In that case, we can use the "mixed" value to
 * indicate that.
 */
export type VirtualModelTrainedForToolUse = true | false | "mixed";

const virtualModelTrainedForToolUseSchema: ZodSchema<VirtualModelTrainedForToolUse> = z.union([
  z.boolean(),
  z.literal("mixed"),
]);

/**
 * The indicator whether the virtual model supports vision. There could be cases where not all
 * concrete models support vision. In that case, we can use the "mixed" value to indicate that.
 */
export type VirtualModelVisionSupport = true | false | "mixed";

const virtualModelVisionSupportSchema: ZodSchema<VirtualModelVisionSupport> = z.union([
  z.boolean(),
  z.literal("mixed"),
]);

/**
 * Allows the creator of a model to override certain metadata fields.
 */
export interface VirtualModelDefinitionMetadataOverrides {
  /**
   * Domain type of the model.
   */
  domain?: ModelDomainType;
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
   * (LLM and embedding models only) The context lengths of the model.
   */
  contextLengths?: number[];
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
export const virtualModelDefinitionMetadataOverridesSchema: ZodSchema<VirtualModelDefinitionMetadataOverrides> =
  z.object({
    domain: modelDomainTypeSchema.optional(),
    architectures: z.array(z.string()).optional(),
    compatibilityTypes: z.array(modelCompatibilityTypeSchema).optional(),
    paramsStrings: z.array(z.string()).optional(),
    minMemoryUsageBytes: z.number().optional(),
    contextLengths: z.array(z.number()).optional(),
    trainedForToolUse: virtualModelTrainedForToolUseSchema.optional(),
    vision: virtualModelVisionSupportSchema.optional(),
  });

export interface VirtualModelDefinitionConcreteModelBase {
  /**
   * The key of the concrete model when downloaded.
   */
  key: string;
  /**
   * Where this model can be downloaded from.
   */
  sources: Array<ModelDownloadSource>;
}
export const virtualModelDefinitionConcreteModelBaseSchema: ZodSchema<VirtualModelDefinitionConcreteModelBase> =
  z.object({
    key: z.string(),
    sources: z.array(modelDownloadSourceSchema),
  });

export interface VirtualModelDefinition {
  /**
   * The self proclaimed indexed model identifier. Should always be in the shape of user/repo.
   */
  model: string;
  /**
   * How to find the next model in the model chain. This can either be a single string (representing
   * a virtual model), or an array of concrete model bases.
   */
  base: string | Array<VirtualModelDefinitionConcreteModelBase>;
  tags?: Array<string>;
  config?: {
    load?: KVConfig;
    operation?: KVConfig;
  };
  metadataOverrides?: VirtualModelDefinitionMetadataOverrides;
}
export const virtualModelDefinitionSchema: ZodSchema<VirtualModelDefinition> = z.object({
  model: z.string().regex(/^[^/]+\/[^/]+$/),
  base: z.union([z.string(), z.array(virtualModelDefinitionConcreteModelBaseSchema)]),
  tags: z.array(z.string().max(100)).optional(),
  config: z
    .object({
      load: kvConfigSchema.optional(),
      operation: kvConfigSchema.optional(),
    })
    .optional(),
  metadataOverrides: virtualModelDefinitionMetadataOverridesSchema.optional(),
});
