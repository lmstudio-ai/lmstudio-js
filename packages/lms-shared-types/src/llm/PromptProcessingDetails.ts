import { z, type ZodSchema } from "zod";

/**
 * Detailed prompt processing counts for Prompt Processing events.
 */
export interface PromptProcessingDetails {
  /**
   * Number of prompt tokens reused from cache (no processing required).
   */
  cachedTokenCount: number;
  /**
   * Total number of prompt tokens in the request.
   */
  totalPromptTokenCount: number;
  /**
   * Tokens processed by the model (work already completed).
   */
  processedPromptTokenCount: number;
  /**
   * Tokens queued for processing but not yet completed.
   */
  unprocessedPromptTokenCount: number;
}

export const promptProcessingDetailsSchema = z.object({
  cachedTokenCount: z.number(),
  totalPromptTokenCount: z.number(),
  processedPromptTokenCount: z.number(),
  unprocessedPromptTokenCount: z.number(),
}) as ZodSchema<PromptProcessingDetails>;
