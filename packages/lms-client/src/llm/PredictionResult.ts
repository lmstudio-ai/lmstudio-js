import {
  type KVConfig,
  type LLMInstanceInfo,
  type LLMPredictionStats,
} from "@lmstudio/lms-shared-types";

/**
 * Base interface for all prediction result types, including those that are produced by an LLM and
 * those that are produced by a generator plugin.
 *
 * @public
 */
export interface BasePredictionResult {
  /**
   * The generated content of the prediction result.
   */
  content: string;
  /**
   * Part of the generated text that is "reasoning" content. For example, text inside <think>
   * tags.
   */
  reasoningContent: string;
  /**
   * Part of the generated text that is not "reasoning" content. For example, text outside <think>
   * tags.
   */
  nonReasoningContent: string;
}

/**
 * Represents the result of an LLM prediction.
 *
 * The most notably property is {@link PredictionResult#content}, which contains the generated text.
 * Additionally, the {@link PredictionResult#stats} property contains statistics about the
 * prediction.
 *
 * @public
 */
export class PredictionResult implements BasePredictionResult {
  public constructor(
    /**
     * The newly generated text as predicted by the LLM.
     */
    public readonly content: string,
    /**
     * Part of the generated text that is "reasoning" content. For example, text inside <think>
     * tags. You can adjust what is considered reasoning content by changing the `reasoningParsing`
     * field when performing the prediction.
     */
    public readonly reasoningContent: string,
    /**
     * Part of the generated that is not "reasoning" content. For example, text outside <think>
     * tags. You can adjust what is considered reasoning content by changing the `reasoningParsing`
     * field when performing the prediction.
     */
    public readonly nonReasoningContent: string,
    /**
     * Statistics about the prediction.
     */
    public readonly stats: LLMPredictionStats,
    /**
     * Information about the model used for the prediction.
     */
    public readonly modelInfo: LLMInstanceInfo,
    /**
     * The 0-indexed round index of the prediction in multi-round scenario (for example,
     * `.act`). Will always be 0 for single-round predictions such as `.respond` or `.complete`.
     */
    public readonly roundIndex: number,
    /**
     * The configuration used to load the model. Not stable, subject to change.
     *
     * @deprecated [DEP-RAW-CONFIG] Raw config access API is still in active development. Stay
     * turned for updates.
     */
    public readonly loadConfig: KVConfig,
    /**
     * The configuration used for the prediction. Not stable, subject to change.
     *
     * @deprecated [DEP-RAW-CONFIG] Raw config access API is still in active development. Stay
     * turned for updates.
     */
    public readonly predictionConfig: KVConfig,
  ) {}
}

/**
 * Result of a typed structured prediction. In addition to a regular {@link PredictionResult}, there
 * is one additional field: {@link StructuredPredictionResult#parsed}.
 *
 * To enable typed structured prediction, you should pass in a zod schema as the structured option
 * when constructing the prediction config.
 *
 * @public
 */
export class StructuredPredictionResult<TStructuredOutputType = unknown> extends PredictionResult {
  public constructor(
    content: string,
    reasoningContent: string,
    nonReasoningContent: string,
    stats: LLMPredictionStats,
    modelInfo: LLMInstanceInfo,
    roundIndex: number,
    loadConfig: KVConfig,
    predictionConfig: KVConfig,
    /**
     * Parsed result of the structured output.
     */
    public readonly parsed: TStructuredOutputType,
  ) {
    super(
      content,
      reasoningContent,
      nonReasoningContent,
      stats,
      modelInfo,
      roundIndex,
      loadConfig,
      predictionConfig,
    );
  }
}
