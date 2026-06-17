import { z } from "zod";
import { llmJinjaPromptTemplateSchema, type LLMJinjaPromptTemplate } from "./LLMPromptTemplate.js";

/** @public */
export interface LLMLoadPromptTemplate {
  type: "jinja";
  jinjaPromptTemplate: LLMJinjaPromptTemplate;
}

export const llmLoadPromptTemplateSchema = z.object({
  type: z.literal("jinja"),
  jinjaPromptTemplate: llmJinjaPromptTemplateSchema,
}) as z.Schema<LLMLoadPromptTemplate>;
