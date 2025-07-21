import { z, type ZodSchema } from "zod";

export type TokenSourceIdentifier =
  | { type: "model"; identifier: string }
  | { type: "generator"; pluginIdentifier: string };
export const tokenSourceIdentifierSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("model"),
    identifier: z.string(),
  }),
  z.object({
    type: z.literal("generator"),
    pluginIdentifier: z.string(),
  }),
]) as ZodSchema<TokenSourceIdentifier>;
