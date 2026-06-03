import { z } from "zod";
import {
  llmJinjaPromptTemplateSchema,
  type LLMJinjaPromptTemplate,
} from "./LLMPromptTemplate.js";

/** @public */
export type LLMLoadPromptTemplateOverride =
  | {
      type: "modelDefault";
    }
  | {
      type: "jinja";
      jinjaPromptTemplate: LLMJinjaPromptTemplate;
      stopStrings: Array<string>;
    };

export const llmLoadPromptTemplateOverrideSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("modelDefault"),
  }),
  z.object({
    type: z.literal("jinja"),
    jinjaPromptTemplate: llmJinjaPromptTemplateSchema,
    stopStrings: z.array(z.string()),
  }),
]) as z.Schema<LLMLoadPromptTemplateOverride>;
