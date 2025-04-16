import { z, type ZodSchema } from "zod";
import { fileNameSchema } from "./path.js";

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

export type ModelDownloadSource = HuggingFaceModelDownloadSource;
export const modelDownloadSourceSchema: ZodSchema<ModelDownloadSource> = z.discriminatedUnion(
  "type",
  [huggingFaceModelDownloadSourceSchema],
);
