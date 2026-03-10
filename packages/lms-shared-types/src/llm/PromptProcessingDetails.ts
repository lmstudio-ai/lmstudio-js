import { z, type ZodSchema } from "zod";

/**
 * Token counts reported during prompt processing.
 *
 * @public
 */
export interface PromptProcessingDetails {
  /**
   * Number of prompt tokens reused from cache (no processing required).
   */
  cachedTokenCount: number;
  /**
   * Total number of prompt tokens in the request.
   * ```
   * totalPromptTokenCount = cachedTokenCount + processedPromptTokenCount + unprocessedPromptTokenCount
   * ```
   */
  totalPromptTokenCount: number;
  /**
   * Tokens processed by the model (work already completed).
   * ```
   * totalPromptTokenCount = cachedTokenCount + processedPromptTokenCount + unprocessedPromptTokenCount
   * ```
   */
  processedPromptTokenCount: number;
  /**
   * Tokens queued for processing but not yet completed.
   * ```
   * totalPromptTokenCount = cachedTokenCount + processedPromptTokenCount + unprocessedPromptTokenCount
   * ```
   */
  unprocessedPromptTokenCount: number;
}

export const promptProcessingDetailsSchema = z.object({
  cachedTokenCount: z.number(),
  totalPromptTokenCount: z.number(),
  processedPromptTokenCount: z.number(),
  unprocessedPromptTokenCount: z.number(),
}) as ZodSchema<PromptProcessingDetails>;
