import { z } from "zod";

/**
 * Internal descriptor for the operation being carried over the shared prediction channel.
 *
 * This is not a public SDK prediction option. Public SDK methods choose the intent and pass it
 * through backend plumbing so providers can dispatch without inferring from config-stack details.
 *
 * @internal
 */
export const llmPredictionOperationIntentSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("standardPrediction"),
  }),
  z.object({
    type: z.literal("rawTextCompletion"),
    rawPrompt: z.string(),
  }),
]);

/** @internal */
export type LLMPredictionOperationIntent = z.infer<typeof llmPredictionOperationIntentSchema>;
