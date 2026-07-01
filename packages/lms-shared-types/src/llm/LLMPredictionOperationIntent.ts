import { z } from "zod";

/**
 * Describes the original prediction interface that started this prediction.
 *
 * This lets a prediction request keep the caller's intended operation separate from the chat
 * history and prediction config used to carry it.
 */
export const llmPredictionOperationIntentSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("chatPrediction"),
  }),
  z.object({
    type: z.literal("rawTextCompletion"),
    rawPrompt: z.string(),
  }),
]);

export type LLMPredictionOperationIntent = z.infer<typeof llmPredictionOperationIntentSchema>;
