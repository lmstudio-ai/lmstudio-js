import { StreamablePromise } from "@lmstudio/lms-common";
import { type LLMPredictionFragment } from "@lmstudio/lms-shared-types";
import { GeneratorPredictionResult } from "./GeneratorPredictionResult";

/**
 * Represents an ongoing prediction from a generator.
 *
 * Note, this class is Promise-like, meaning you can use it as a promise. It resolves to a
 * {@link GeneratorPredictionResult}, which contains the generated text in the `.content` property. Example
 * usage:
 *
 * ```typescript
 * const result = await generator.complete("When will The Winds of Winter be released?");
 * console.log(result.content);
 * ```
 *
 * Or you can use instances methods like `then` and `catch` to handle the result or error of the
 * prediction.
 *
 * ```typescript
 * generator.complete("When will The Winds of Winter be released?")
 *  .then(result =\> console.log(result.content))
 *  .catch(error =\> console.error(error));
 * ```
 *
 * Alternatively, you can also stream the result (process the results as more content is being
 * generated). For example:
 *
 * ```typescript
 * for await (const { content } of generator.complete("When will The Winds of Winter be released?")) {
 *   process.stdout.write(content);
 * }
 * ```
 *
 * @public
 * @experimental [EXP-GEN-PREDICT] Using generator plugins programmatically is still in development.
 * This may change in the future without warning.
 */
export class OngoingGeneratorPrediction extends StreamablePromise<
  LLMPredictionFragment,
  GeneratorPredictionResult
> {
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
    return new GeneratorPredictionResult(
      content,
      reasoningContent,
      nonReasoningContent,
      this.pluginIdentifier,
    );
  }

  private constructor(
    private readonly pluginIdentifier: string,
    private readonly onCancel: () => void,
  ) {
    super();
  }

  /** @internal */
  public static create(pluginIdentifier: string, onCancel: () => void) {
    const ongoingPrediction = new OngoingGeneratorPrediction(pluginIdentifier, onCancel);
    const finished = () => ongoingPrediction.finished();
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
   * const prediction = generator.complete("When will The Winds of Winter be released?");
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
  public async result(): Promise<GeneratorPredictionResult> {
    return await this;
  }

  /**
   * Cancels the prediction.
   */
  public async cancel() {
    this.onCancel();
  }
}
