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
 * @public
 */
export interface LLMJinjaPromptTemplate {
  template: string;
}
export const llmJinjaPromptTemplateSchema = z.object({
  template: z.string(),
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
