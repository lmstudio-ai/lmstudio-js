import { z } from "zod";

/**
 * @public
 */
export interface LLMManualPromptTemplate {
  /**
   * String to be prepended to the system prompt.
   */
  beforeSystem: string;
  /**
   * String to be appended to the system prompt.
   */
  afterSystem: string;
  /**
   * String to be prepended to a user message.
   */
  beforeUser: string;
  /**
   * String to be appended to a user message.
   */
  afterUser: string;
  /**
   * String to be prepended to an assistant message.
   */
  beforeAssistant: string;
  /**
   * String to be appended to an assistant message.
   */
  afterAssistant: string;
}
export const llmManualPromptTemplateSchema = z.object({
  beforeSystem: z.string(),
  afterSystem: z.string(),
  beforeUser: z.string(),
  afterUser: z.string(),
  beforeAssistant: z.string(),
  afterAssistant: z.string(),
});

/**
 * Configures how images in ChatHistoryMessages should be input to jinja for prompt rendering.
 *
 * ### simple
 * Images are represented in text as a single static string. I.e: "\<image\>"
 *
 * ### numbered
 * Images are represented in text as numbered strings with numbers between a prefix and suffix.
 * I.e.: "\<image_1\>","\<image_2\>", etc.
 *
 * ### object
 * Images are represented as an object in the jinja render input. I.e.: \{ type: "image" \}
 * @public
 */
export type LLMJinjaInputMessagesContentImagesConfig =
  | { type: "simple"; value: string }
  | { type: "numbered"; prefix: string; suffix: string }
  | { type: "object" };
export const llmJinjaInputMessagesContentImagesConfigSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("simple"),
    value: z.string(),
  }),
  z.object({
    type: z.literal("numbered"),
    prefix: z.string(),
    suffix: z.string(),
  }),
  z.object({
    type: z.literal("object"),
  }),
]);

/**
 * Possible field names for text in jinja input messages (when content is an array).
 * @public
 */
export type LLMJinjaInputMessagesContentConfigTextFieldName = "content" | "text";
export const llmJinjaInputMessagesContentConfigTextFieldNameSchema = z.enum(["content", "text"]);

/**
 * Configures how content in ChatHistoryMessages should be input to jinja for prompt rendering.
 *
 * ### string
 *
 * Content is represented as a single string,
 *
 * i.e.: `{ role: "user", content: "Hello" }`
 *
 * ### array
 * Content is represented as an array of typed parts,
 *
 * i.e.: `{ role: "user", content: [{ type: "text", text: "Hello" }] }`
 *
 * @public
 */
export type LLMJinjaInputMessagesContentConfig =
  | {
      type: "string";
      imagesConfig?: LLMJinjaInputMessagesContentImagesConfig;
    }
  | {
      type: "array";
      textFieldName: LLMJinjaInputMessagesContentConfigTextFieldName;
      imagesConfig?: LLMJinjaInputMessagesContentImagesConfig;
    };
export const llmJinjaInputMessagesContentConfigSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("string"),
    imagesConfig: llmJinjaInputMessagesContentImagesConfigSchema.optional(),
  }),
  z.object({
    type: z.literal("array"),
    textFieldName: llmJinjaInputMessagesContentConfigTextFieldNameSchema,
    imagesConfig: llmJinjaInputMessagesContentImagesConfigSchema.optional(),
  }),
]);

/**
 * Configures how tools should be input to jinja for prompt rendering.
 * @public
 */
export type LLMJinjaInputToolUseType = "noTools" | "inSystemMessage" | "inToolsField";
export const llmJinjaInputToolUseTypeSchema = z.enum([
  "noTools",
  "inSystemMessage",
  "inToolsField",
]);

/**
 * Configures how ChatHistoryMessages should be input to jinja for prompt rendering.
 * @public
 */
export interface LLMJinjaInputMessagesConfig {
  contentConfig: LLMJinjaInputMessagesContentConfig;
}
export const llmJinjaInputMessagesConfigSchema = z.object({
  contentConfig: llmJinjaInputMessagesContentConfigSchema,
});

/**
 *
 * Configures how ChatHistoryData should be input to jinja for prompt rendering.
 *
 * @public
 */
export interface LLMJinjaInputConfig {
  messagesConfig: LLMJinjaInputMessagesConfig;
  toolUseType: LLMJinjaInputToolUseType;
}
export const llmJinjaInputConfigSchema = z.object({
  messagesConfig: llmJinjaInputMessagesConfigSchema,
  toolUseType: llmJinjaInputToolUseTypeSchema,
});

/**
 * @public
 */
export interface LLMJinjaPromptTemplate {
  template: string;
  /**
   * Required for applying Jinja template.
   */
  bosToken: string;
  /**
   * Required for applying Jinja template.
   */
  eosToken: string;
  /**
   * Config for how ChatHistoryData should be input to jinja for prompt rendering.
   */
  inputConfig: LLMJinjaInputConfig;
}
export const llmJinjaPromptTemplateSchema = z.object({
  template: z.string(),
  bosToken: z.string(),
  eosToken: z.string(),
  inputConfig: llmJinjaInputConfigSchema,
});

/** @public */
export type LLMPromptTemplateType = "manual" | "jinja";
export const llmPromptTemplateTypeSchema = z.enum(["manual", "jinja"]);

/**
 * @public
 */
export interface LLMPromptTemplate {
  type: LLMPromptTemplateType;
  manualPromptTemplate?: LLMManualPromptTemplate;
  jinjaPromptTemplate?: LLMJinjaPromptTemplate;
  /**
   * Additional stop strings to be used with this template.
   */
  stopStrings: Array<string>;
}
export const llmPromptTemplateSchema = z.object({
  type: llmPromptTemplateTypeSchema,
  manualPromptTemplate: llmManualPromptTemplateSchema.optional(),
  jinjaPromptTemplate: llmJinjaPromptTemplateSchema.optional(),
  stopStrings: z.array(z.string()),
});
