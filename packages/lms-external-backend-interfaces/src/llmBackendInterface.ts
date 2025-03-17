import { type InferClientPort } from "@lmstudio/lms-communication-client";
import {
  chatHistoryDataSchema,
  kvConfigSchema,
  kvConfigStackSchema,
  llmApplyPromptTemplateOptsSchema,
  type LLMInfo,
  llmInfoSchema,
  type LLMInstanceInfo,
  llmInstanceInfoSchema,
  llmPredictionFragmentSchema,
  llmPredictionStatsSchema,
  modelSpecifierSchema,
  toolCallRequestSchema,
} from "@lmstudio/lms-shared-types";
import { z } from "zod";
import {
  type BaseModelBackendInterface,
  createBaseModelBackendInterface,
} from "./baseModelBackendInterface.js";

export function createLlmBackendInterface() {
  const baseModelBackendInterface = createBaseModelBackendInterface(
    llmInstanceInfoSchema,
    llmInfoSchema,
  ) as any as BaseModelBackendInterface<LLMInstanceInfo, LLMInfo>;
  return (
    baseModelBackendInterface
      .addChannelEndpoint("predict", {
        creationParameter: z.object({
          modelSpecifier: modelSpecifierSchema,
          history: chatHistoryDataSchema,
          predictionConfigStack: kvConfigStackSchema,
          /**
           * Which preset to use. Supports limited fuzzy matching.
           */
          fuzzyPresetIdentifier: z.string().optional(),
          ignoreServerSessionConfig: z.boolean().optional(),
        }),
        toClientPacket: z.discriminatedUnion("type", [
          z.object({
            type: z.literal("fragment"),
            fragment: llmPredictionFragmentSchema,
            logprobs: z
              .array(z.array(z.object({ text: z.string(), logprob: z.number() })))
              .optional(),
          }),
          z.object({
            type: z.literal("promptProcessingProgress"),
            progress: z.number(),
          }),
          z.object({
            type: z.literal("toolCallGenerationStart"),
          }),
          z.object({
            type: z.literal("toolCallGenerationEnd"),
            toolCallRequest: toolCallRequestSchema,
          }),
          z.object({
            type: z.literal("toolCallGenerationFailed"),
          }),
          z.object({
            type: z.literal("success"),
            stats: llmPredictionStatsSchema,
            modelInfo: llmInstanceInfoSchema,
            loadModelConfig: kvConfigSchema,
            predictionConfig: kvConfigSchema,
          }),
        ]),
        toServerPacket: z.discriminatedUnion("type", [
          z.object({
            type: z.literal("cancel"),
          }),
        ]),
      })
      .addRpcEndpoint("applyPromptTemplate", {
        parameter: z.object({
          specifier: modelSpecifierSchema,
          history: chatHistoryDataSchema,
          predictionConfigStack: kvConfigStackSchema,
          opts: llmApplyPromptTemplateOptsSchema,
        }),
        returns: z.object({
          formatted: z.string(),
        }),
      })
      .addRpcEndpoint("tokenize", {
        parameter: z.object({
          specifier: modelSpecifierSchema,
          inputString: z.string(),
        }),
        returns: z.object({
          tokens: z.array(z.number()),
        }),
      })
      .addRpcEndpoint("countTokens", {
        parameter: z.object({
          specifier: modelSpecifierSchema,
          inputString: z.string(),
        }),
        returns: z.object({
          tokenCount: z.number().int(),
        }),
      })
      // Starts to eagerly preload a draft model. This is useful when you want a draft model to be
      // ready for speculative decoding.
      .addRpcEndpoint("preloadDraftModel", {
        parameter: z.object({
          specifier: modelSpecifierSchema,
          draftModelKey: z.string(),
        }),
        returns: z.void(),
      })
  );
}

export type LLMPort = InferClientPort<typeof createLlmBackendInterface>;
export type LLMBackendInterface = ReturnType<typeof createLlmBackendInterface>;
