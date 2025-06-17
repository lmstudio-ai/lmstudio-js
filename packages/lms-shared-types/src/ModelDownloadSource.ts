import { z, type ZodSchema } from "zod";
import { fileNameSchema } from "./path.js";

/**
 * Represents a download source for a Hugging Face model.
 *
 * @public
 */
export type HuggingFaceModelDownloadSource = {
  type: "huggingface";
  user: string;
  repo: string;
};
export const huggingFaceModelDownloadSourceSchema = z.object({
  type: z.literal("huggingface"),
  user: fileNameSchema,
  repo: fileNameSchema,
});

/**
 * Represents a download source for a concrete model.
 *
 * @public
 */
export type ModelDownloadSource = HuggingFaceModelDownloadSource;
export const modelDownloadSourceSchema: ZodSchema<ModelDownloadSource> = z.discriminatedUnion(
  "type",
  [huggingFaceModelDownloadSourceSchema],
);
