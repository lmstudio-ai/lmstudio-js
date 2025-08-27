import { z, type ZodSchema } from "zod";

/**
 * @public
 * @experimental [EXP-MODEL-PROCESSING-STATE] Getting the processing state of a model instance is
 * experimental and may change in the future.
 */
type ModelProcessingStatus = "idle" | "processingPrompt" | "generating" | "computingEmbedding";

const modelProcessingStatusSchema = z.enum([
  "idle",
  "processingPrompt",
  "generating",
  "computingEmbedding",
]) as ZodSchema<ModelProcessingStatus>;

/**
 * @public
 * @experimental [EXP-MODEL-PROCESSING-STATE] Getting the processing state of a model instance is
 * experimental and may change in the future.
 */
export interface ModelProcessingState {
  status: ModelProcessingStatus;
  /**
   * Number of requests that are currently in the queue (Including the current one)
   */
  queued: number;
}
export const modelProcessingStateSchema = z.object({
  status: modelProcessingStatusSchema,
  queued: z.number(),
}) as ZodSchema<ModelProcessingState>;
