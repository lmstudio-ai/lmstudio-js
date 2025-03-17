import {
  type KVConfig,
  type LLMInstanceInfo,
  type LLMPredictionStats,
} from "@lmstudio/lms-shared-types";

/**
 * Represents the result of a prediction.
 *
 * The most notably property is {@link PredictionResult#content}, which contains the generated text.
 * Additionally, the {@link PredictionResult#stats} property contains statistics about the
 * prediction.
 *
 * @public
 */
export class PredictionResult {
  public constructor(
    /**
     * The newly generated text as predicted by the LLM.
     */
    public readonly content: string,
    /**
     * Part of the generated text that is part of the "reasoning" content, for example, those that
     * are inside <think> tags. You can adjust what is considered reasoning content by changing the
     * `reasoningParsing` field when performing the prediction.
     *
     * @experimental The name of this field may change in the future.
     */
    public readonly reasoningContent: string,
    /**
     * Part of the generated that is not part of the reasoning content, for example, those that are
     * outside <think> tags. You can adjust what is considered reasoning content by changing the
     * `reasoningParsing` field when performing the prediction.
     *
     * @experimental The name of this field may change in the future.
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
     * @deprecated Not stable - subject to change
     */
    public readonly loadConfig: KVConfig,
    /**
     * The configuration used for the prediction. Not stable, subject to change.
     *
     * @deprecated Not stable - subject to change
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
