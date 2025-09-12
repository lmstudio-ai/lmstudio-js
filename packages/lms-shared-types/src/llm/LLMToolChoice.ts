import { z } from "zod";

/**
 * TODO: Documentation
 *
 * @public
 */
export type LLMToolChoice = {
  type: "generic";
  mode: "none" | "auto" | "required";
};

export const llmToolChoiceSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("generic"),
    mode: z.enum(["none", "auto", "required"]),
  }),
]);
