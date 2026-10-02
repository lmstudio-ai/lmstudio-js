import { z } from "zod";

/**
 * @public
 */
export type ModelDomainType =
  | "llm"
  | "embedding"
  | "decision"
  | "drafter"
  | "imageGen"
  | "transcription"
  | "tts";
export const modelDomainTypeSchema = z.enum([
  "llm",
  "embedding",
  "decision",
  "drafter",
  "imageGen",
  "transcription",
  "tts",
]);
