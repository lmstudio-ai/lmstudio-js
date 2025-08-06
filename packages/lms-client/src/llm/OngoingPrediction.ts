import { StreamablePromise } from "@lmstudio/lms-common";
import {
  type KVConfig,
  type LLMInstanceInfo,
  type LLMPredictionFragment,
  type LLMPredictionStats,
  type LLMPredictionStopReason,
} from "@lmstudio/lms-shared-types";
import { PredictionResult, StructuredPredictionResult } from "./PredictionResult.js";

/**
 * Represents an ongoing prediction.
 *
 * Note, this class is Promise-like, meaning you can use it as a promise. It resolves to a
 * {@link PredictionResult}, which contains the generated text in the `.content` property. Example
 * usage:
 *
 * ```typescript
 * const result = await model.complete("When will The Winds of Winter be released?");
 * console.log(result.content);
 * ```
 *
 * Or you can use instances methods like `then` and `catch` to handle the result or error of the
 * prediction.
 *
 * ```typescript
 * model.complete("When will The Winds of Winter be released?")
 *  .then(result =\> console.log(result.content))
 *  .catch(error =\> console.error(error));
 * ```
 *
 * Alternatively, you can also stream the result (process the results as more content is being
 * generated). For example:
 *
 * ```typescript
 * for await (const { content } of model.complete("When will The Winds of Winter be released?")) {
 *   process.stdout.write(content);
 * }
 * ```
 *
 * @public
 */
export class OngoingPrediction<TStructuredOutputType = unknown> extends StreamablePromise<
  LLMPredictionFragment,
  unknown extends TStructuredOutputType
    ? // If TStructuredOutputType is unknown, return PredictionResult (no parsed field)
      PredictionResult
    : // If TStructuredOutputType is not unknown, return StructuredPredictionResult (with parsed
      // field)
      StructuredPredictionResult<TStructuredOutputType>
> {
  private stats: LLMPredictionStats | null = null;
  private modelInfo: LLMInstanceInfo | null = null;
  private loadModelConfig: KVConfig | null = null;
  private predictionConfig: KVConfig | null = null;

  protected override async collect(fragments: ReadonlyArray<LLMPredictionFragment>) {
    const content = fragments.map(({ content }) => content).join("");
    const reasoningContent = fragments
      .filter(({ isStructural }) => !isStructural)
      .filter(({ reasoningType }) => reasoningType === "reasoning")
      .map(({ content }) => content)
      .join("");
    const nonReasoningContent = fragments
      .filter(({ isStructural }) => !isStructural)
      .filter(({ reasoningType }) => reasoningType === "none")
      .map(({ content }) => content)
      .join("");
    if (this.stats === null) {
      throw new Error("Stats should not be null");
    }
    if (this.modelInfo === null) {
      throw new Error("Model info should not be null");
    }
    if (this.loadModelConfig === null) {
      throw new Error("Load model config should not be null");
    }
    if (this.predictionConfig === null) {
      throw new Error("Prediction config should not be null");
    }
    if (this.parser === null) {
      return new PredictionResult(
        content,
        reasoningContent,
        nonReasoningContent,
        this.stats,
        this.modelInfo,
        // Currently, OngoingPrediction is only used with single round predictions. Thus always
        // use roundIndex 0.
        /* roundIndex */ 0,
        this.loadModelConfig,
        this.predictionConfig,
      ) as any;
    } else {
      return new StructuredPredictionResult<TStructuredOutputType>(
        content,
        reasoningContent,
        nonReasoningContent,
        this.stats,
        this.modelInfo,
        // Currently, OngoingPrediction is only used with single round predictions. Thus always
        // use roundIndex 0.
        /* predictionIndex */ 0,
        this.loadModelConfig,
        this.predictionConfig,
        this.parser(content),
      ) as any;
    }
  }

  private constructor(
    private readonly onCancel: () => void,
    private readonly parser: ((content: string) => TStructuredOutputType) | null,
  ) {
    super();
  }

  /** @internal */
  public static create<TStructuredOutputType>(
    onCancel: () => void,
    parser: ((content: string) => TStructuredOutputType) | null,
  ) {
    const ongoingPrediction = new OngoingPrediction<TStructuredOutputType>(onCancel, parser);
    const finished = (
      stats: LLMPredictionStats,
      modelInfo: LLMInstanceInfo,
      loadModelConfig: KVConfig,
      predictionConfig: KVConfig,
    ) => {
      ongoingPrediction.stats = stats;
      ongoingPrediction.modelInfo = modelInfo;
      ongoingPrediction.loadModelConfig = loadModelConfig;
      ongoingPrediction.predictionConfig = predictionConfig;
      ongoingPrediction.finished();
    };
    const failed = (error?: any) => ongoingPrediction.finished(error);
    const push = (fragment: LLMPredictionFragment) => ongoingPrediction.push(fragment);
    return { ongoingPrediction, finished, failed, push };
  }

  /**
   * Get the final prediction results. If you have been streaming the results, awaiting on this
   * method will take no extra effort, as the results are already available in the internal buffer.
   *
   * Example:
   *
   * ```typescript
   * const prediction = model.complete("When will The Winds of Winter be released?");
   * for await (const { content } of prediction) {
   *   process.stdout.write(content);
   * }
   * const result = await prediction.result();
   * console.log(result.stats);
   * ```
   *
   * Technically, awaiting on this method is the same as awaiting on the instance itself:
   *
   * ```typescript
   * await prediction.result();
   *
   * // Is the same as:
   *
   * await prediction;
   * ```
   */
  public async result(): Promise<
    unknown extends TStructuredOutputType
      ? // If TStructuredOutputType is unknown, return PredictionResult (no parsed field)
        PredictionResult
      : // If TStructuredOutputType is not unknown, return StructuredPredictionResult (with parsed
        // field)
        StructuredPredictionResult<TStructuredOutputType>
  > {
    return (await this) as any;
  }

  /**
   * Cancels the prediction. This will stop the prediction with stop reason `userStopped`. See
   * {@link LLMPredictionStopReason} for other reasons that a prediction might stop.
   */
  public async cancel() {
    this.onCancel();
  }
}
