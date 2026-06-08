import { z } from "zod";
import { llmJinjaPromptTemplateSchema, type LLMJinjaPromptTemplate } from "./LLMPromptTemplate.js";

/** @public */
export interface LLMLoadPromptTemplate {
  type: "jinja";
  jinjaPromptTemplate: LLMJinjaPromptTemplate;
  stopStrings: Array<string>;
}

export const llmLoadPromptTemplateSchema = z.object({
  type: z.literal("jinja"),
  jinjaPromptTemplate: llmJinjaPromptTemplateSchema,
  stopStrings: z.array(z.string()),
}) as z.Schema<LLMLoadPromptTemplate>;
