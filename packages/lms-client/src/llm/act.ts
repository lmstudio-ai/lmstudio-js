import {
  accessMaybeMutableInternals,
  makePrettyError,
  makePromise,
  safeCallCallback,
  SimpleLogger,
  text,
} from "@lmstudio/lms-common";
import {
  type ChatHistoryData,
  type ChatMessagePartToolCallRequestData,
  type ChatMessagePartToolCallResultData,
  type FunctionToolCallRequest,
  type LLMPredictionFragment,
  type ToolCallRequest,
} from "@lmstudio/lms-shared-types";
import { z } from "zod";
import { Chat, type ChatLike, ChatMessage } from "../Chat.js";
import { ActResult } from "./ActResult.js";
import { PredictionResult } from "./PredictionResult.js";
import { SimpleToolCallContext, type Tool } from "./tool.js";

import { type LLMPredictionFragmentWithRoundIndex } from "./LLMDynamicHandle.js";

export interface LLMActBaseOpts<TPredictionResult> {
  /**
   * A callback that is called when the model has output the first token of a prediction. This
   * callback is called with round index (the index of the prediction within `.act(...)`,
   * 0-indexed).
   */
  onFirstToken?: (roundIndex: number) => void;
  /**
   * A callback for each fragment that is output by the model. This callback is called with the
   * fragment that is emitted. The fragment itself is augmented with the round index (the index of
   * the prediction within `.act(...)`, 0-indexed).
   *
   * For example, for an `.act` invocation with 2 predictions, the callback may be called in the
   * following sequence.
   *
   * - `{ roundIndex: 0, content: "f1", ... }` when the first prediction emits `f1`.
   * - `{ roundIndex: 0, content: "f2", ... }` when the first prediction emits `f2`.
   * - `{ roundIndex: 1, content: "f3", ... }` when the second prediction emits `f3`.
   * - `{ roundIndex: 1, content: "f4", ... }` when the second prediction emits `f4`.
   */
  onPredictionFragment?: (fragment: LLMPredictionFragmentWithRoundIndex) => void;
  /**
   * A callback that is called when a message is generated and should be added to the Chat. This is
   * useful if you want to add the generated content to a chat so you can continue the conversation.
   *
   * Note that, during one `act` call, multiple messages may be generated, and this callback
   * will be called multiple times. For example, if the model requests to use a tool during the
   * first prediction and stops after the second prediction, three messages will be created (and
   * thus this callback will be called three times):
   *
   * 1. The first prediction's generated message, which contains information about the tool request.
   * 2. The result of running the tool.
   * 3. The second prediction's generated message.
   */
  onMessage?: (message: ChatMessage) => void;
  /**
   * A callback that will be called when a new round of prediction starts.
   */
  onRoundStart?: (roundIndex: number) => void;
  /**
   * A callback that will be called when a round of prediction ends.
   */
  onRoundEnd?: (roundIndex: number) => void;
  /**
   * A callback that will be called when a prediction in a round is completed. The callback is
   * called with the result of the prediction. You can access the roundIndex via the `.roundIndex`
   * property. (See {@link PredictionResult} for more info).
   *
   * Note: this is called immediately after the prediction is completed. The tools may still be
   * running.
   */
  onPredictionCompleted?: (predictionResult: TPredictionResult) => void;
  /**
   * A callback that is called when the model is processing the prompt. The callback is called with
   * the round index (the index of the prediction within `.act(...)`, 0-indexed) and a number
   * between 0 and 1, representing the progress of the prompt processing.
   *
   * For example, for an `.act` invocation with 2 prediction rounds, the callback may be called
   * in the following sequence.
   *
   * - `(0, 0.3)` when the first prediction's prompt processing is 30% done.
   * - `(0, 0.7)` when the first prediction's prompt processing is 70% done.
   * - ... The model starts to stream the first prediction's output, during which, this callback is
   *   not called.
   * - `(1, 0.3)` when the second prediction's prompt processing is 50% done.
   * - `(1, 0.7)` when the second prediction's prompt processing is 70% done.
   */
  onPromptProcessingProgress?: (roundIndex: number, progress: number) => void;
  /**
   * A callback that is called when the model starts generating a tool call request.
   *
   * This hook is intended for updating the UI, such as showing "XXX is planning to use a tool...".
   * At this stage the tool call request has not been generated thus we don't know what tool will be
   * called. It is guaranteed that each `invocation` of `onToolCallRequestStart` is paired
   * with exactly one `onToolCallRequestEnd` or `onToolCallRequestFailure`.
   *
   * @experimental This option is experimental and may change in the future.
   */
  onToolCallRequestStart?: (roundIndex: number, callId: number) => void;
  /**
   * A callback that is called when a tool call is requested by the model.
   *
   * You should not use this callback to call the tool - the SDK will automatically call the tools
   * you provided in the tools array.
   *
   * Instead, you can use this callback to update the UI or maintain the context. If you are unsure
   * what to do with this callback, you can ignore it.
   *
   * @experimental This option is experimental and may change in the future. Especially the third
   * parameter (toolCallRequest) which is very likely to be changed to a nicer type.
   */
  onToolCallRequestEnd?: (
    roundIndex: number,
    callId: number,
    toolCallRequest: FunctionToolCallRequest,
  ) => void;
  /**
   * A callback that is called when a tool call has failed to generate.
   *
   * This hook is intended for updating the UI, such as showing "a tool call has failed to
   * generate.".
   *
   * @experimental This option is experimental and may change in the future.
   */
  onToolCallRequestFailure?: (roundIndex: number, callId: number) => void;
  /**
   * A handler that is called when a tool request is made by the model but is invalid.
   *
   * There are multiple ways for a tool request to be invalid. For example, the model can simply
   * output a string that claims to be a tool request, but cannot at all be parsed as one. Or it may
   * request to use a tool that doesn't exist, or the parameters provided are invalid.
   *
   * When this happens, LM Studio will provide why it failed in the error parameter. We will also
   * try to parse the tool request and provide it as the second parameter. However, this is not
   * guaranteed to success, and the second parameter may be `undefined`.
   *
   * If we successfully parsed the request (thus the request parameter is not undefined), anything
   * returned in this callback will be used as the result of the tool call. This is useful for
   * providing a error message to the model so it may try again. However, if nothing (undefined) is
   * returned, LM Studio will not provide a result to the given tool call.
   *
   * If we failed to parsed the request (thus the request parameter is undefined), the return value
   * of this callback will be ignored as LM Studio cannot provide results to a tool call that has
   * failed to parse.
   *
   * If you decide the failure is too severe to continue, you can always throw an error in this
   * callback, which will immediately fail the `.act` call with the same error you provided.
   *
   * By default, we use the following implementation:
   *
   * ```ts
   * handleInvalidToolRequest: (error, request) => {
   *   if (request) {
   *     return error.message;
   *   }
   *   throw error;
   * },
   * ```
   *
   * The default handler will do the following: If the model requested a tool that can be parsed but
   * is still invalid, we will return the error message as the result of the tool call. If the model
   * requested a tool that cannot be parsed, we will throw an error, which will immediately fail the
   * `.act` call.
   *
   * Note, when an invalid tool request occurs due to parameters type mismatch, we will never call
   * the original tool automatically due to security considerations. If you do decide to call the
   * original tool, you can do so manually within this callback.
   *
   * This callback can also be async.
   */
  handleInvalidToolRequest?: (
    error: Error,
    request: ToolCallRequest | undefined,
  ) => any | Promise<any>;
  /**
   * Limit the number of prediction rounds that the model can perform. In the last prediction, the
   * model will not be allowed to use more tools.
   *
   * Note, some models may requests multiple tool calls within a single prediction round. This
   * option only limits the number of prediction rounds, not the total number of tool calls.
   */
  maxPredictionRounds?: number;
  /**
   * An abort signal that can be used to cancel the prediction.
   */
  signal?: AbortSignal;
}
export const llmActBaseOptsSchema = z.object({
  onFirstToken: z.function().optional(),
  onPredictionFragment: z.function().optional(),
  onMessage: z.function().optional(),
  onRoundStart: z.function().optional(),
  onRoundEnd: z.function().optional(),
  onPredictionCompleted: z.function().optional(),
  onPromptProcessingProgress: z.function().optional(),
  onToolCallRequestStart: z.function().optional(),
  onToolCallRequestEnd: z.function().optional(),
  onToolCallRequestFailure: z.function().optional(),
  handleInvalidToolRequest: z.function().optional(),
  maxPredictionRounds: z.number().int().min(1).optional(),
  signal: z.instanceof(AbortSignal).optional(),
});

const defaultHandleInvalidToolRequest = (error: Error, request: ToolCallRequest | undefined) => {
  if (request) {
    return error.message;
  }
  throw error;
};

interface ActPredictionImplementationArgs<TEndPacket> {
  /**
   * Whether this round allows the model to use tools.
   */
  allowTools: boolean;
  history: ChatHistoryData;
  signal: AbortSignal;
  handleFragment: (fragment: LLMPredictionFragment) => void;
  handlePromptProcessingProgress: (progress: number) => void;
  handleToolCallGenerationStart: () => void;
  handleToolCallGenerationEnd: (request: ToolCallRequest) => void;
  handleToolCallGenerationFailed: () => void;
  handlePredictionEnd: (predictionResult: TEndPacket) => void;
  handleError: (error: Error) => void;
}

type ActPredictImplementation<TEndPacket> = (
  args: ActPredictionImplementationArgs<TEndPacket>,
) => Promise<void>;

/**
 * The arguments passed to the `makePredictionResult` function. This function is used to create
 * the `TPredictionResult`.
 */
interface ActMakePredictionResultArgs<TEndPacket> {
  endPacket: TEndPacket;
  content: string;
  reasoningContent: string;
  nonReasoningContent: string;
  predictionsPerformed: number;
}

/**
 * The internal method for performing .act(). This is used by both `LLMDynamicHandle` and
 * `LLMGeneratorHandle`.
 *
 * @param TPredictionResult - The type of the prediction result.
 * @param TEndPacket - The type of the success packet that is returned. This type is received from
 * `handlePredictionEnd` and is passed to the `makePredictionResult` function to create the
 * `TPredictionResult`.
 * @param chat - The chat to use for the prediction.
 * @param tools - The tools to use for the prediction. This is an array of tools that the model can
 * use during the prediction.
 * @param baseOpts - The base options for the prediction. This includes callbacks and other
 * options that control the prediction process.
 * @param stack - The stack trace to use for the prediction. This is used for generating errors.
 * @param logger - The logger to use for the prediction. This is used for logging messages during
 * the prediction.
 * @param startTime - The start time of the prediction. This is used to calculate the duration of
 * the act.
 * @param predictImpl - The implementation of the prediction. This is a function that takes the
 * prediction arguments and performs the prediction. This is the main abstraction - `internalAct`
 * performs the prediction loop while this function handles the actual prediction itself.
 * @param makePredictionResult - A function that takes the end packet and the content of the
 * prediction and creates the `TPredictionResult`. This is used to create the prediction result
 * object for each round of the prediction.
 */
export async function internalAct<TPredictionResult, TEndPacket>(
  chat: ChatLike,
  tools: Array<Tool>,
  baseOpts: LLMActBaseOpts<TPredictionResult>,
  stack: string,
  logger: SimpleLogger,
  startTime: number,
  predictImpl: ActPredictImplementation<TEndPacket>,
  makePredictionResult: (args: ActMakePredictionResultArgs<TEndPacket>) => TPredictionResult,
) {
  const abortController = new AbortController();
  const mutableChat = Chat.from(chat); // Make a copy
  /**
   * Our ID that allows users to match up calls.
   */
  let currentCallId = 0;

  if (baseOpts.signal !== undefined) {
    baseOpts.signal.addEventListener(
      "abort",
      () => {
        abortController.abort(baseOpts.signal?.reason);
      },
      { once: true },
    );
  }

  let shouldContinue = false;
  let predictionsPerformed = 0;

  const toolsMap = new Map<string, Tool>();
  for (const tool of tools) {
    if (toolsMap.has(tool.name)) {
      logger.warnText`
          Duplicate tool (${tool.name}) found in the tools array. The last tool with the same name
          will be used.
        `;
    }
    toolsMap.set(tool.name, tool);
  }

  do {
    // Main loop - execute as many times as the model requests tools
    let allowTools = true;
    if (
      // If there is a defined number of max predictions,
      baseOpts.maxPredictionRounds !== undefined &&
      // ... and this is the last chance to perform predictions, don't allow the model to use
      // tools.
      predictionsPerformed + 1 >= baseOpts.maxPredictionRounds
    ) {
      allowTools = false;
    }

    // Start the prediction
    let finished = false;
    let firstTokenTriggered = false;
    const contentArray: Array<string> = [];
    const reasoningContentArray: Array<string> = [];
    const nonReasoningContentArray: Array<string> = [];

    const toolCallRequests: Array<ToolCallRequest> = [];
    let nextToolCallIndex = 0;
    const toolCallResults: Array<{
      /**
       * The index of the tool call (i.e. the order that this tool call was requested). This is
       * important because tool calls can finish out-of-order, and we need to sort them back into
       * the order they were requested.
       */
      index: number;
      data: ChatMessagePartToolCallResultData;
    }> = [];

    /**
     * All promises that need to be awaited. Once they are done, they will add their own results
     * to the toolCallResults array in-place.
     */
    const toolCallPromises: Array<Promise<void>> = [];
    /**
     * The promise that represents the prediction itself (The RPC call).
     */
    const {
      promise: predictionPromise,
      resolve: predictionResolve,
      reject: predictionReject,
    } = makePromise<void>();
    /**
     * The final promise that will be awaited on for this prediction. It is resolved when the
     * prediction is done and all tool calls have been resolved.
     */
    const {
      promise: finalPromise,
      resolve: finalResolve,
      reject: finalReject,
    } = makePromise<void>();

    const internalHandleInvalidToolCallRequest = async (
      error: Error,
      request: ToolCallRequest | undefined,
      /**
       * In the case this tool call got a replacement, the index to use.
       */
      toolCallIndex: number,
    ) => {
      let result: any;
      try {
        result = await (baseOpts.handleInvalidToolRequest ?? defaultHandleInvalidToolRequest)(
          error,
          request,
        );
      } catch (error) {
        if (abortController.signal.aborted) {
          throw abortController.signal.reason;
        }
        abortController.abort();
        throw error; // Rethrow the error.
      }
      if (result === undefined) {
        // No replacement.
        return;
      }
      let resultString: string;
      try {
        resultString = JSON.stringify(result);
      } catch (error) {
        abortController.abort();
        throw makePrettyError(
          "handleInvalidToolRequest returned a value that cannot be converted to JSON.",
          stack,
        );
      }
      // The handleInvalidToolRequest has returned a "replacement"
      if (request === undefined) {
        // We cannot provide a result to a tool call that has failed to parse.
        logger.warnText`
            The "handleInvalidToolRequest" callback has returned a result, but the tool request has
            completely failed to parse, thus LM Studio cannot provide the result to the tool call.
            Please avoid returning a result when the second parameter of the callback is undefined.
            See the documentation for "handleInvalidToolRequest" for more information.
          `;
      } else {
        toolCallResults.push({
          index: toolCallIndex,
          data: {
            type: "toolCallResult",
            toolCallId: request.id,
            content: resultString,
          },
        });
        nextToolCallIndex++;
      }
    };

    abortController.signal.throwIfAborted();

    // Round start callback
    safeCallCallback(logger, "onRoundStart", baseOpts.onRoundStart, [predictionsPerformed]);

    let isGeneratingToolCall = false;

    /**
     * Abort controller for the current round.
     */
    const roundAbortController = new AbortController();

    predictImpl({
      allowTools,
      history: accessMaybeMutableInternals(mutableChat)._internalGetData(),
      signal: roundAbortController.signal,
      handleFragment: fragment => {
        if (!firstTokenTriggered) {
          firstTokenTriggered = true;
          safeCallCallback(logger, "onFirstToken", baseOpts.onFirstToken, [predictionsPerformed]);
        }
        safeCallCallback(logger, "onFragment", baseOpts.onPredictionFragment, [
          { roundIndex: predictionsPerformed, ...fragment },
        ]);
        contentArray.push(fragment.content);
        if (fragment.reasoningType === "reasoning") {
          reasoningContentArray.push(fragment.content);
        } else {
          nonReasoningContentArray.push(fragment.content);
        }
      },
      handlePromptProcessingProgress: progress => {
        safeCallCallback(
          logger,
          "onPromptProcessingProgress",
          baseOpts.onPromptProcessingProgress,
          [predictionsPerformed, progress],
        );
      },
      handleToolCallGenerationStart: () => {
        currentCallId++;
        isGeneratingToolCall = true;
        safeCallCallback(logger, "onToolCallRequestStart", baseOpts.onToolCallRequestStart, [
          predictionsPerformed,
          currentCallId,
        ]);
      },
      handleToolCallGenerationEnd: request => {
        isGeneratingToolCall = false;
        const toolCallIndex = nextToolCallIndex;
        nextToolCallIndex++;
        // We have now received a tool call request. Now let's see if we can call the tool and
        // get the result.
        toolCallRequests.push(request);
        const tool = toolsMap.get(request.name);
        if (tool === undefined) {
          // Tool does not exist.
          toolCallPromises.push(
            internalHandleInvalidToolCallRequest(
              new Error(`Cannot find tool with name ${request.name}.`),
              request,
              toolCallIndex,
            ).catch(finalReject),
          );
          safeCallCallback(logger, "onToolCallRequestFailure", baseOpts.onToolCallRequestFailure, [
            predictionsPerformed,
            currentCallId,
          ]);
          return;
        }
        const parameters = request.arguments ?? {}; // Defaults to empty object
        // Try check the parameters:
        try {
          tool.checkParameters(parameters); // Defaults to empty object
        } catch (error: any) {
          // Failed to parse the parameters
          toolCallPromises.push(
            internalHandleInvalidToolCallRequest(
              new Error(text`
                      Failed to parse arguments for tool ${request.name}: ${error.message}
                    `),
              request,
              toolCallIndex,
            ).catch(finalReject),
          );
          safeCallCallback(logger, "onToolCallRequestFailure", baseOpts.onToolCallRequestFailure, [
            predictionsPerformed,
            currentCallId,
          ]);
          return;
        }
        const toolCallContext = new SimpleToolCallContext(
          new SimpleLogger(`Tool(${request.name})`, logger),
          abortController.signal,
          currentCallId,
        );
        safeCallCallback(logger, "onToolCallRequestEnd", baseOpts.onToolCallRequestEnd, [
          predictionsPerformed,
          currentCallId,
          request,
        ]);
        // We have successfully parsed the parameters. Let's call the tool.
        toolCallPromises.push(
          (async () => {
            const result = await tool.implementation(parameters, toolCallContext);
            let resultString: string;
            if (result === undefined) {
              resultString = "undefined";
            } else {
              try {
                resultString = JSON.stringify(result);
              } catch (error) {
                throw makePrettyError(
                  `Return value of tool ${tool.name} cannot be converted to JSON.`,
                  stack,
                );
              }
            }
            toolCallResults.push({
              index: toolCallIndex,
              data: {
                type: "toolCallResult",
                toolCallId: request.id,
                content: resultString,
              },
            });
          })().catch(finalReject),
        );
      },
      handleToolCallGenerationFailed: () => {
        isGeneratingToolCall = false;
        toolCallPromises.push(
          internalHandleInvalidToolCallRequest(
            new Error(`Failed to parse tool call request.`),
            // We don't have a request in this because the model has failed miserably.
            undefined,
            // Tool call index. Doesn't matter because if there is no request, there cannot be
            // a replacement.
            0,
          ).catch(finalReject),
        );
        safeCallCallback(logger, "onToolCallRequestFailure", baseOpts.onToolCallRequestFailure, [
          predictionsPerformed,
          currentCallId,
        ]);
      },
      handlePredictionEnd: endPacket => {
        const predictionResult = makePredictionResult({
          endPacket,
          content: contentArray.join(""),
          reasoningContent: reasoningContentArray.join(""),
          nonReasoningContent: nonReasoningContentArray.join(""),
          predictionsPerformed,
        });
        safeCallCallback(logger, "onPredictionCompleted", baseOpts.onPredictionCompleted, [
          predictionResult,
        ]);
        predictionResolve();
      },
      handleError: error => {
        if (isGeneratingToolCall) {
          // Notify tool call generation failure.
          isGeneratingToolCall = false;
          safeCallCallback(logger, "onToolCallRequestFailure", baseOpts.onToolCallRequestFailure, [
            predictionsPerformed,
            currentCallId,
          ]);
        }
        finished = true;
        predictionReject(error);
      },
    });
    const abortListener = () => {
      if (finished) {
        return;
      }
      finished = true;
      roundAbortController.abort(abortController.signal.reason);
    };
    abortController.signal.addEventListener("abort", abortListener);

    predictionPromise
      .then(() => {
        // Append and emit the assistant message.
        const assistantMessage = ChatMessage.from({
          role: "assistant",
          content: [
            {
              type: "text",
              text: contentArray.join(""),
            },
            ...toolCallRequests.map<ChatMessagePartToolCallRequestData>(toolCallRequest => ({
              type: "toolCallRequest",
              toolCallRequest,
            })),
          ],
        });
        mutableChat.append(assistantMessage.asMutableCopy());
        safeCallCallback(logger, "onMessage", baseOpts.onMessage, [assistantMessage]);
      })
      // When the prediction is completed, wait for all tool calls to be completed.
      .then(() => Promise.all(toolCallPromises))
      .then(() => finalResolve(), finalReject);

    await finalPromise;

    shouldContinue = false;
    if (toolCallResults.length > 0) {
      // Sort the tool call results back into the order they were requested.
      toolCallResults.sort((a, b) => a.index - b.index);

      // Emit the tool call results.
      const toolMessage = ChatMessage.from({
        role: "tool",
        content: toolCallResults.map(r => r.data),
      });
      mutableChat.append(toolMessage.asMutableCopy());
      safeCallCallback(logger, "onMessage", baseOpts.onMessage, [toolMessage]);
      shouldContinue = true;
    }

    safeCallCallback(logger, "onRoundEnd", baseOpts.onRoundEnd, [predictionsPerformed]);

    predictionsPerformed++;
    // Don't continue if we've reached the max predictions.
    if (
      baseOpts.maxPredictionRounds !== undefined &&
      predictionsPerformed >= baseOpts.maxPredictionRounds
    ) {
      shouldContinue = false;
    }
  } while (shouldContinue);
  return new ActResult(predictionsPerformed, (performance.now() - startTime) / 1_000);
}
