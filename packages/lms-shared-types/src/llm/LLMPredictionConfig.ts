import { z, type ZodSchema } from "zod";
import { kvConfigSchema, type KVConfig } from "../KVConfig.js";
import { toolNamingSchema, type ToolNaming } from "../ToolNaming.js";
import { zodSchemaSchema } from "../Zod.js";
import { llmPromptTemplateSchema, type LLMPromptTemplate } from "./LLMPromptTemplate.js";
import {
  llmStructuredPredictionSettingSchema,
  type LLMStructuredPredictionSetting,
} from "./LLMStructuredPredictionSetting.js";
import { llmToolUseSettingSchema, type LLMToolUseSetting } from "./LLMToolUseSetting.js";

/**
 * Behavior for when the generated tokens length exceeds the context window size. Only the following
 * values are allowed:
 *
 * - `stopAtLimit`: Stop the prediction when the generated tokens length exceeds the context window
 *   size. If the generation is stopped because of this limit, the `stopReason` in the prediction
 *   stats will be set to `contextLengthReached`.
 * - `truncateMiddle`: Keep the system prompt and the first user message, truncate middle.
 * - `rollingWindow`: Maintain a rolling window and truncate past messages.
 *
 * @public
 */
export type LLMContextOverflowPolicy = "stopAtLimit" | "truncateMiddle" | "rollingWindow";
export const llmContextOverflowPolicySchema = z.enum([
  "stopAtLimit",
  "truncateMiddle",
  "rollingWindow",
]);

/**
 * How to parse reasoning sections in the model output. An easier to use type will be added in the
 * future.
 *
 * @public
 */
export interface LLMReasoningParsing {
  /**
   * Whether to enable reasoning parsing.
   */
  enabled: boolean;
  startString: string;
  endString: string;
}
export const llmReasoningParsingSchema = z.object({
  enabled: z.boolean(),
  startString: z.string(),
  endString: z.string(),
});

/**
 * Shared config for running predictions on an LLM.
 *
 * @public
 */
export interface LLMPredictionConfigInput<TStructuredOutputType = unknown> {
  /**
   * Number of tokens to predict at most. If set to false, the model will predict as many tokens as
   * it wants.
   *
   * When the prediction is stopped because of this limit, the `stopReason` in the prediction stats
   * will be set to `maxPredictedTokensReached`.
   *
   * See {@link LLMPredictionStopReason} for other reasons that a prediction might stop.
   */
  maxTokens?: number | false;
  /**
   * The temperature parameter for the prediction model. A higher value makes the predictions more
   * random, while a lower value makes the predictions more deterministic. The value should be
   * between 0 and 1.
   */
  temperature?: number;
  /**
   * An array of strings. If the model generates one of these strings, the prediction will stop.
   *
   * When the prediction is stopped because of this limit, the `stopReason` in the prediction stats
   * will be set to `stopStringFound`.
   *
   * See {@link LLMPredictionStopReason} for other reasons that a prediction might stop.
   */
  stopStrings?: Array<string>;
  /**
   * An array of strings. If the model generates one of these strings, the prediction will stop with
   * the `stopReason` `toolCalls`.
   *
   * See {@link LLMPredictionStopReason} for other reasons that a prediction might stop.
   */
  toolCallStopStrings?: Array<string>;
  /**
   * The behavior for when the generated tokens length exceeds the context window size. The allowed
   * values are:
   *
   * - `stopAtLimit`: Stop the prediction when the generated tokens length exceeds the context
   *   window size. If the generation is stopped because of this limit, the `stopReason` in the
   *   prediction stats will be set to `contextLengthReached`
   * - `truncateMiddle`: Keep the system prompt and the first user message, truncate middle.
   * - `rollingWindow`: Maintain a rolling window and truncate past messages.
   */
  contextOverflowPolicy?: LLMContextOverflowPolicy;
  /**
   * Configures the model to output structured JSON data that follows a specific schema defined
   * using Zod.
   *
   * When you provide a Zod schema, the model will be instructed to generate JSON that conforms to
   * that schema rather than free-form text.
   *
   * This is particularly useful for extracting specific data points from model responses or when
   * you need the output in a format that can be directly used by your application.
   */
  structured?:
    | {
        /**
         * IMPORTANT
         *
         * When passing in a zod schema as the structured generation option, you must provide an
         * actual zod schema object. (returned by z.something()). The type here only requires an
         * object with a `parse` function. This is not enough! We need an actual zod schema because
         * we will need to extract the JSON schema from it. If you don't want use zod, consider
         * passing in a `LLMStructuredPredictionSetting` instead.
         *
         * The reason we only have a `parse` function here (as oppose to actually requiring
         * ZodType<TStructuredOutputType> is due to this zod bug causing TypeScript breakage, when
         * multiple versions of zod exist.
         *
         * - https://github.com/colinhacks/zod/issues/577
         * - https://github.com/colinhacks/zod/issues/2697
         * - https://github.com/colinhacks/zod/issues/3435
         */
        parse: (input: any) => TStructuredOutputType;
      }
    | LLMStructuredPredictionSetting;
  /**
   * @deprecated Raw tools are currently not well-supported. It may or may not work. If you want to
   * use tools, use `model.act` instead.
   */
  rawTools?: LLMToolUseSetting;
  /**
   * What transformations to apply to tool names before sending them to the model. See
   * {@link ToolNaming} for more details.
   */
  toolNaming?: ToolNaming;
  /**
   * Controls token sampling diversity by limiting consideration to the K most likely next tokens.
   *
   * For example, if set to 40, only the 40 tokens with the highest probabilities will be considered
   * for the next token selection. A lower value (e.g., 20) will make the output more focused and
   * conservative, while a higher value (e.g., 100) allows for more creative and diverse outputs.
   *
   * Typical values range from 20 to 100.
   */
  topKSampling?: number;
  /**
   * Applies a penalty to repeated tokens to prevent the model from getting stuck in repetitive
   * patterns.
   *
   * A value of 1.0 means no penalty. Values greater than 1.0 increase the penalty. For example, 1.2
   * would reduce the probability of previously used tokens by 20%. This is particularly useful for
   * preventing the model from repeating phrases or getting stuck in loops.
   *
   * Set to false to disable the penalty completely.
   */
  repeatPenalty?: number | false;
  /**
   * Sets a minimum probability threshold that a token must meet to be considered for generation.
   *
   * For example, if set to 0.05, any token with less than 5% probability will be excluded from
   * consideration. This helps filter out unlikely or irrelevant tokens, potentially improving
   * output quality.
   *
   * Value should be between 0 and 1. Set to false to disable this filter.
   */
  minPSampling?: number | false;
  /**
   * Implements nucleus sampling by only considering tokens whose cumulative probabilities reach a
   * specified threshold.
   *
   * For example, if set to 0.9, the model will consider only the most likely tokens that together
   * add up to 90% of the probability mass. This helps balance between diversity and quality by
   * dynamically adjusting the number of tokens considered based on their probability distribution.
   *
   * Value should be between 0 and 1. Set to false to disable nucleus sampling.
   */
  topPSampling?: number | false;
  /**
   * Controls how often the XTC (Exclude Top Choices) sampling technique is applied during
   * generation.
   *
   * XTC sampling can boost creativity and reduce clichés by occasionally filtering out common
   * tokens. For example, if set to 0.3, there's a 30% chance that XTC sampling will be applied when
   * generating each token.
   *
   * Value should be between 0 and 1. Set to false to disable XTC completely.
   */
  xtcProbability?: number | false;
  /**
   * Defines the lower probability threshold for the XTC (Exclude Top Choices) sampling technique.
   *
   * When XTC sampling is activated (based on xtcProbability), the algorithm identifies tokens with
   * probabilities between this threshold and 0.5, then removes all such tokens except the least
   * probable one. This helps introduce more diverse and unexpected tokens into the generation.
   *
   * Only takes effect when xtcProbability is enabled.
   */
  xtcThreshold?: number | false;
  /**
   * @deprecated We are still working on bringing logProbs to SDK. Stay tuned for updates.
   */
  logProbs?: number | false;
  /**
   * Specifies the number of CPU threads to allocate for model inference.
   *
   * Higher values can improve performance on multi-core systems but may compete with other
   * processes. For example, on an 8-core system, a value of 4-6 might provide good performance
   * while leaving resources for other tasks.
   *
   * If not specified, the system will use a default value based on available hardware.
   */
  cpuThreads?: number;
  /**
   * Defines a custom template for formatting prompts before sending them to the model.
   *
   * Prompt templates allow you to control exactly how conversations are formatted, including
   * system messages, user inputs, and assistant responses. This is particularly useful when
   * working with models that expect specific formatting conventions.
   *
   * Different models may have different optimal prompt templates, so this allows for
   * model-specific customization.
   *
   * @deprecated The current type for promptTemplate is not yet finalized. We are working on a new
   * type that will be more flexible and easier to use. Stay tuned for updates.
   */
  promptTemplate?: LLMPromptTemplate;
  /**
   * The draft model to use for speculative decoding. Speculative decoding is a technique that can
   * drastically increase the generation speed (up to 3x for larger models) by paring a main model
   * with a smaller draft model.
   *
   * See here for more information: https://lmstudio.ai/docs/advanced/speculative-decoding
   *
   * You do not need to load the draft model yourself. Simply specifying its model key here is
   * enough.
   */
  draftModel?: string;
  /**
   * Warning: Experimental and subject to change.
   *
   * @alpha
   * @deprecated This feature is experimental and may change or be removed in the future.
   */
  speculativeDecodingNumDraftTokensExact?: number;
  /**
   * Warning: Experimental and subject to change.
   *
   * Minimum number of drafted tokens required to run draft through the main model.
   *
   * @alpha
   *
   */
  speculativeDecodingMinDraftLengthToConsider?: number;
  /**
   * Warning: Experimental and subject to change.
   *
   * @alpha
   * @deprecated This feature is experimental and may change or be removed in the future.
   */
  speculativeDecodingMinContinueDraftingProbability?: number;
  /**
   * How to parse the reasoning sections in the model output. Only need to specify the `startString`
   * and the `endString`.
   *
   * For example, DeepSeek models use:
   *
   * ```
   * reasoningParsing: {
   *   enabled: true,
   *   startString: "<think>",
   *   endString: "</think>",
   * }
   * ```
   */
  reasoningParsing?: LLMReasoningParsing;
  /**
   * Raw KV Config.
   *
   * @experimental
   * @deprecated Internal mechanism to carry arbitrary config that does not have a public API yet.
   * May change at any time. Do not use.
   */
  raw?: KVConfig;
}
export const llmPredictionConfigInputSchema = z.object({
  maxTokens: z.number().int().min(-1).optional().or(z.literal(false)),
  temperature: z.number().min(0).optional(),
  stopStrings: z.array(z.string()).optional(),
  toolCallStopStrings: z.array(z.string()).optional(),
  contextOverflowPolicy: llmContextOverflowPolicySchema.optional(),
  structured: z.union([zodSchemaSchema, llmStructuredPredictionSettingSchema]).optional(),
  rawTools: llmToolUseSettingSchema.optional(),
  toolNaming: toolNamingSchema.optional(),
  topKSampling: z.number().optional(),
  repeatPenalty: z.number().optional().or(z.literal(false)),
  minPSampling: z.number().optional().or(z.literal(false)),
  topPSampling: z.number().optional().or(z.literal(false)),
  cpuThreads: z.number().int().optional(),
  promptTemplate: llmPromptTemplateSchema.optional(),
  draftModel: z.string().optional(),
  speculativeDecodingNumDraftTokensExact: z.number().int().min(1).optional(),
  speculativeDecodingMinDraftLengthToConsider: z.number().int().min(0).optional(),
  speculativeDecodingMinContinueDraftingProbability: z.number().optional(),
  reasoningParsing: llmReasoningParsingSchema.optional(),
  raw: kvConfigSchema.optional(),
});

/**
 * @public
 */
export type LLMPredictionConfig = Omit<LLMPredictionConfigInput<any>, "structured"> & {
  structured?: LLMStructuredPredictionSetting;
};
export const llmPredictionConfigSchema = z.object({
  ...llmPredictionConfigInputSchema.shape,
  structured: llmStructuredPredictionSettingSchema.optional(),
}) as ZodSchema<LLMPredictionConfig>;

export interface LLMLlamaMirostatSamplingConfig {
  /**
   * 0 = disabled
   */
  version: 0 | 1 | 2;
  learningRate: number;
  targetEntropy: number;
}
export const llmLlamaMirostatSamplingConfigSchema = z.object({
  version: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  learningRate: z.number(),
  targetEntropy: z.number(),
});

/**
 * Specify a number to modify the likelihood. Specify "-inf" to prevent the token from being
 * generated.
 */
export type LLMLlamaSingleLogitBiasModification = number | "-inf";
export const llmLlamaSingleLogitBiasModificationSchema = z.union([z.number(), z.literal("-inf")]);

export type LLMLlamaLogitBiasConfig = Array<
  [token: number, modification: LLMLlamaSingleLogitBiasModification]
>;
export const llmLlamaLogitBiasConfigSchema = z.array(
  z.tuple([z.number(), llmLlamaSingleLogitBiasModificationSchema]),
);
