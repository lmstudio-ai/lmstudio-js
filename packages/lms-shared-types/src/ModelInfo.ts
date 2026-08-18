import { z } from "zod";
import {
  type EmbeddingModelInfo,
  embeddingModelInfoSchema,
  type EmbeddingModelInstanceInfo,
  embeddingModelInstanceInfoSchema,
} from "./embedding/EmbeddingModelInfo.js";
import {
  type DrafterModelInfo,
  drafterModelInfoSchema,
  type LLMInfo,
  llmInfoSchema,
  type LLMInstanceInfo,
  llmInstanceInfoSchema,
} from "./llm/LLMModelInfo.js";

/**
 * Information about a model.
 *
 * @public
 */
export type ModelInfo = LLMInfo | EmbeddingModelInfo | DrafterModelInfo;
export const modelInfoSchema = z.discriminatedUnion("type", [
  llmInfoSchema as any,
  embeddingModelInfoSchema as any,
  drafterModelInfoSchema as any,
]) as z.ZodSchema<ModelInfo>;

/**
 * Information about a model that is loaded.
 *
 * @public
 */
export type ModelInstanceInfo = LLMInstanceInfo | EmbeddingModelInstanceInfo;
export const modelInstanceInfoSchema = z.discriminatedUnion("type", [
  llmInstanceInfoSchema as any,
  embeddingModelInstanceInfoSchema as any,
]) as z.ZodSchema<ModelInstanceInfo>;
