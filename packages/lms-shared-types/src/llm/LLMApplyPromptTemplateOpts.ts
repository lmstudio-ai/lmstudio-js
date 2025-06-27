import { z } from "zod";
import { llmToolSchema, type LLMTool } from "./LLMToolUseSetting.js";

/**
 * Options for applying a prompt template.
 * @public
 */
export interface LLMApplyPromptTemplateOpts {
  /**
   * Whether to omit the BOS token when formatting.
   *
   * Default: false
   */
  omitBosToken?: boolean;
  /**
   * Whether to omit the EOS token when formatting.
   *
   * Default: false
   */
  omitEosToken?: boolean;
  /**
   * Optional tool definitions to include in the prompt.
   */
  toolDefinitions?: Array<LLMTool>;
}
export const llmApplyPromptTemplateOptsSchema = z.object({
  omitBosToken: z.boolean().optional(),
  omitEosToken: z.boolean().optional(),
  toolDefinitions: z.array(llmToolSchema).optional(),
});
