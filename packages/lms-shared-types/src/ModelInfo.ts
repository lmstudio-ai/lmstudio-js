import { z } from "zod";
import {
  type DecisionModelInfo,
  decisionModelInfoSchema,
  type DecisionModelInstanceInfo,
  decisionModelInstanceInfoSchema,
} from "./decision/DecisionModelInfo.js";
import {
  type EmbeddingModelInfo,
  embeddingModelInfoSchema,
  type EmbeddingModelInstanceInfo,
  embeddingModelInstanceInfoSchema,
} from "./embedding/EmbeddingModelInfo.js";
import {
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
export type ModelInfo = LLMInfo | EmbeddingModelInfo | DecisionModelInfo;
export const modelInfoSchema: z.ZodSchema<ModelInfo> = z.union([
  llmInfoSchema,
  embeddingModelInfoSchema,
  decisionModelInfoSchema,
]);

/**
 * Information about a model that is loaded.
 *
 * @public
 */
export type ModelInstanceInfo =
  | LLMInstanceInfo
  | EmbeddingModelInstanceInfo
  | DecisionModelInstanceInfo;
export const modelInstanceInfoSchema: z.ZodSchema<ModelInstanceInfo> = z.union([
  llmInstanceInfoSchema,
  embeddingModelInstanceInfoSchema,
  decisionModelInstanceInfoSchema,
]);
