import { z } from "zod";

/**
 * @public
 */
export type ModelDomainType = "llm" | "embedding" | "drafter" | "imageGen" | "transcription" | "tts";
export const modelDomainTypeSchema = z.enum([
  "llm",
  "embedding",
  "drafter",
  "imageGen",
  "transcription",
  "tts",
]);
