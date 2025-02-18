import { z } from "zod";

/**
 * Represents the type of this fragment in terms of reasoning.
 *
 * - `none`: Content outside of a reasoning block.
 * - `reasoning`: Content inside a reasoning block.
 * - `reasoningStartTag`: Start tag of a reasoning block.
 * - `reasoningEndTag`: End tag of a reasoning block.
 *
 * @public
 */
export type LLMPredictionFragmentReasoningType =
  | "none"
  | "reasoning"
  | "reasoningStartTag"
  | "reasoningEndTag";
export const llmPredictionFragmentReasoningTypeSchema = z.enum([
  "none",
  "reasoning",
  "reasoningStartTag",
  "reasoningEndTag",
]);

/**
 * Represents a fragment of a prediction from an LLM. Note that a fragment may contain multiple
 * tokens.
 *
 * @public
 */
export interface LLMPredictionFragment {
  /**
   * String content of the fragment.
   */
  content: string;
  /**
   * Number of tokens contains in this fragment. Note this value is not always accurate as tokens
   * may be split across fragments. However, over a period of time, the sum of token counts of
   * multiple fragments will be close to the actual token count. As such, this value can be
   * accumulated to provide a "live tokens count".
   */
  tokensCount: number;
  /**
   * Whether this fragment contains tokens from the draft model.
   */
  containsDrafted: boolean;
  /**
   * Type of reasoning for this fragment. See {@link LLMPredictionFragmentReasoningType} for more
   * info.
   */
  reasoningType: LLMPredictionFragmentReasoningType;
}
export const llmPredictionFragmentSchema = z.object({
  content: z.string(),
  tokensCount: z.number().int(),
  containsDrafted: z.boolean(),
  reasoningType: llmPredictionFragmentReasoningTypeSchema,
});
