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
    super(content, stats, modelInfo, roundIndex, loadConfig, predictionConfig);
  }
}
