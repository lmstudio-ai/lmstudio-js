import { z, type ZodSchema } from "zod";
import { jsonSerializableSchema } from "./JSONSerializable.js";
import {
  kvConfigFieldSchema,
  kvConfigSchema,
  type KVConfig,
  type KVConfigField,
} from "./KVConfig.js";
import {
  modelCompatibilityTypeSchema,
  type ModelCompatibilityType,
} from "./ModelCompatibilityType.js";
import { modelDomainTypeSchema, type ModelDomainType } from "./ModelDomainType.js";
import { modelDownloadSourceSchema, type ModelDownloadSource } from "./ModelDownloadSource.js";

export type BooleanOrMixed = true | false | "mixed";
export const booleanOrMixedSchema: ZodSchema<BooleanOrMixed> = z.union([
  z.literal(true),
  z.literal(false),
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
  trainedForToolUse?: BooleanOrMixed;
  /**
   * (LLM only) Whether the model can take image inputs. Could be a mixture of image input and
   * non-image input concrete models.
   */
  vision?: BooleanOrMixed;
  /**
   * (LLM only) Whether the model is trained for reasoning. Could be a mixture of reasoning and
   * non-reasoning concrete models.
   */
  reasoning?: BooleanOrMixed;
  /**
   * (LLM only) Whether the model is trained for fill-in-the-middle tasks. Could be a mixture of
   * fill-in-the-middle and non-fill-in-the-middle concrete models.
   */
  fim?: BooleanOrMixed;
  /**
   * (LLM only) The preferred maximum image dimension in pixels for vision-capable models.
   */
  preferredMaxImageDimensionPixels?: number;
}
export const virtualModelDefinitionMetadataOverridesSchema: ZodSchema<VirtualModelDefinitionMetadataOverrides> =
  z.object({
    domain: modelDomainTypeSchema.optional(),
    architectures: z.array(z.string()).optional(),
    compatibilityTypes: z.array(modelCompatibilityTypeSchema).optional(),
    paramsStrings: z.array(z.string()).optional(),
    minMemoryUsageBytes: z.number().optional(),
    contextLengths: z.array(z.number()).optional(),
    trainedForToolUse: booleanOrMixedSchema.optional(),
    vision: booleanOrMixedSchema.optional(),
    reasoning: booleanOrMixedSchema.optional(),
    fim: booleanOrMixedSchema.optional(),
    preferredMaxImageDimensionPixels: z.number().int().min(1).optional(),
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

export interface VirtualModelCustomFieldSetJinjaVariableEffect {
  type: "setJinjaVariable";
  variable: string;
}
export const virtualModelCustomFieldSetJinjaVariableEffectSchema = z.object({
  type: z.literal("setJinjaVariable"),
  variable: z.string(),
});

export interface VirtualModelCustomFieldPrependSystemPromptEffect {
  type: "prependSystemPrompt";
  content: string;
}
export const virtualModelCustomFieldPrependSystemPromptEffectSchema = z.object({
  type: z.literal("prependSystemPrompt"),
  content: z.string(),
});

export interface VirtualModelCustomFieldAppendSystemPromptEffect {
  type: "appendSystemPrompt";
  content: string;
}
export const virtualModelCustomFieldAppendSystemPromptEffectSchema = z.object({
  type: z.literal("appendSystemPrompt"),
  content: z.string(),
});

export interface VirtualModelCustomFieldDefinitionBase {
  /**
   * The key of the custom field. Used in serialization
   */
  key: string;
  /**
   * The display name of the custom field. Used in the UI.
   */
  displayName: string;
  /**
   * The description of the custom field. Used in the UI.
   */
  description: string;
}
export const virtualModelCustomFieldDefinitionBaseSchema = z.object({
  key: z.string(),
  displayName: z.string(),
  description: z.string(),
});

export type VirtualModelBooleanCustomFieldDefinition = VirtualModelCustomFieldDefinitionBase & {
  type: "boolean";
  defaultValue: boolean;
  effects: Array<
    | VirtualModelCustomFieldSetJinjaVariableEffect
    | VirtualModelCustomFieldPrependSystemPromptEffect
    | VirtualModelCustomFieldAppendSystemPromptEffect
  >;
};
export const virtualModelBooleanCustomFieldDefinitionSchema =
  virtualModelCustomFieldDefinitionBaseSchema.extend({
    type: z.literal("boolean"),
    defaultValue: z.boolean(),
    effects: z.array(
      z.discriminatedUnion("type", [
        virtualModelCustomFieldSetJinjaVariableEffectSchema,
        virtualModelCustomFieldPrependSystemPromptEffectSchema,
        virtualModelCustomFieldAppendSystemPromptEffectSchema,
      ]),
    ),
  });

export type VirtualModelStringCustomFieldDefinition = VirtualModelCustomFieldDefinitionBase & {
  type: "string";
  defaultValue: string;
  effects: Array<VirtualModelCustomFieldSetJinjaVariableEffect>;
};
export const virtualModelStringCustomFieldDefinitionSchema =
  virtualModelCustomFieldDefinitionBaseSchema.extend({
    type: z.literal("string"),
    defaultValue: z.string(),
    effects: z.array(
      z.discriminatedUnion("type", [virtualModelCustomFieldSetJinjaVariableEffectSchema]),
    ),
  });

export type VirtualModelSelectCustomFieldDefinition = VirtualModelCustomFieldDefinitionBase & {
  type: "select";
  options: Array<{
    label: string;
    value: string;
  }>;
  defaultValue: string;
  effects: Array<VirtualModelCustomFieldSetJinjaVariableEffect>;
};
export const virtualModelSelectCustomFieldDefinitionSchema =
  virtualModelCustomFieldDefinitionBaseSchema.extend({
    type: z.literal("select"),
    options: z.array(
      z.object({
        label: z.string(),
        value: z.string(),
      }),
    ),
    defaultValue: z.string(),
    effects: z.array(
      z.discriminatedUnion("type", [virtualModelCustomFieldSetJinjaVariableEffectSchema]),
    ),
  });

export type VirtualModelNumberCustomFieldDefinition = VirtualModelCustomFieldDefinitionBase & {
  type: "number";
  defaultValue: number;
  min?: number;
  max?: number;
  int?: boolean;
  /**
   * If present, the UI should render a slider for this field.
   */
  slider?: {
    min: number;
    max: number;
    step: number;
  };
  effects: Array<VirtualModelCustomFieldSetJinjaVariableEffect>;
};
export const virtualModelNumberCustomFieldDefinitionSchema =
  virtualModelCustomFieldDefinitionBaseSchema.extend({
    type: z.literal("number"),
    defaultValue: z.number(),
    min: z.number().optional(),
    max: z.number().optional(),
    int: z.boolean().optional(),
    slider: z
      .object({
        min: z.number(),
        max: z.number(),
        step: z.number(),
      })
      .optional(),
    effects: z.array(
      z.discriminatedUnion("type", [virtualModelCustomFieldSetJinjaVariableEffectSchema]),
    ),
  });

export type VirtualModelCustomFieldDefinition =
  | VirtualModelBooleanCustomFieldDefinition
  | VirtualModelStringCustomFieldDefinition
  | VirtualModelSelectCustomFieldDefinition
  | VirtualModelNumberCustomFieldDefinition;
export const virtualModelCustomFieldDefinitionSchema = z.discriminatedUnion("type", [
  virtualModelBooleanCustomFieldDefinitionSchema,
  virtualModelStringCustomFieldDefinitionSchema,
  virtualModelSelectCustomFieldDefinitionSchema,
  virtualModelNumberCustomFieldDefinitionSchema,
]) as ZodSchema<VirtualModelCustomFieldDefinition>;

/**
 * Represents a condition that compares whether a config item equals a certain value.
 */
export type VirtualModelConditionEquals = {
  type: "equals";
  key: string;
  value: any;
};
export const virtualModelConditionEqualsSchema = z.object({
  type: z.literal("equals"),
  key: z.string(),
  value: jsonSerializableSchema,
});

/**
 * Represents a condition that can be evaluated in a virtual model context.
 */
export type VirtualModelCondition = VirtualModelConditionEquals;
export const virtualModelConditionSchema = z.discriminatedUnion("type", [
  virtualModelConditionEqualsSchema,
]) as ZodSchema<VirtualModelCondition>;

export interface VirtualModelSuggestion {
  /**
   * The message to display when this suggestion is triggered.
   */
  message: string;
  /**
   * The conditions that must all be met for this suggestion to be triggered.
   */
  conditions: Array<VirtualModelCondition>;
  /**
   * The suggested config options. If specified, will surface a button in the UI to apply these
   * options. Also, if all the fields are already set to the suggested values, the suggestion will
   * not be shown.
   */
  fields?: Array<KVConfigField>;
}
export const virtualModelSuggestionSchema = z.object({
  message: z.string(),
  conditions: z.array(virtualModelConditionSchema),
  fields: z.array(kvConfigFieldSchema).optional(),
}) as ZodSchema<VirtualModelSuggestion>;

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
  customFields?: Array<VirtualModelCustomFieldDefinition>;
  suggestions?: Array<VirtualModelSuggestion>;
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
  customFields: z.array(virtualModelCustomFieldDefinitionSchema).optional(),
  suggestions: z.array(virtualModelSuggestionSchema).optional(),
});
