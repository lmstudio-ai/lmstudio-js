import { z } from "zod";
import {
  llmJinjaPromptTemplateSchema,
  type LLMJinjaPromptTemplate,
} from "./LLMPromptTemplate.js";

/** @public */
export interface LLMLoadPromptTemplateOverride {
  type: "jinja";
  jinjaPromptTemplate: LLMJinjaPromptTemplate;
  stopStrings: Array<string>;
}

export const llmLoadPromptTemplateOverrideSchema = z.object({
  type: z.literal("jinja"),
  jinjaPromptTemplate: llmJinjaPromptTemplateSchema,
  stopStrings: z.array(z.string()),
}) as z.Schema<LLMLoadPromptTemplateOverride>;

export const optionalLlmLoadPromptTemplateOverrideSchema = z
  .union([
    llmLoadPromptTemplateOverrideSchema,
    z.undefined(),
  ]) as z.Schema<LLMLoadPromptTemplateOverride | undefined>;
