import {
  accessMaybeMutableInternals,
  BufferedEvent,
  getCurrentStack,
  makePrettyError,
  safeCallCallback,
  SimpleLogger,
  text,
  type Validator,
} from "@lmstudio/lms-common";
import { type LLMPort } from "@lmstudio/lms-external-backend-interfaces";
import {
  addKVConfigToStack,
  collapseKVStack,
  kvConfigToLLMLoadModelConfig,
  kvConfigToLLMPredictionConfig,
  llmPredictionConfigToKVConfig,
  llmSharedLoadConfigSchematics,
  llmSharedPredictionConfigSchematics,
} from "@lmstudio/lms-kv-config";
import {
  type ChatHistoryData,
  fromSerializedError,
  type KVConfig,
  type KVConfigStack,
  type LLMApplyPromptTemplateOpts,
  llmApplyPromptTemplateOptsSchema,
  type LLMInstanceInfo,
  type LLMLoadModelConfig,
  type LLMPredictionConfig,
  type LLMPredictionConfigInput,
  llmPredictionConfigInputSchema,
  type LLMPredictionFragment,
  type LLMPredictionStats,
  type LLMStructuredPredictionSetting,
  type LLMToolUseSetting,
  type ModelSpecifier,
  type ToolCallRequest,
  zodSchemaSchema,
} from "@lmstudio/lms-shared-types";
import { z, type ZodSchema } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { Chat, chatHistoryLikeSchema, type ChatLike, ChatMessage } from "../Chat.js";
import { DynamicHandle } from "../modelShared/DynamicHandle.js";
import { internalAct, type LLMActBaseOpts, llmActBaseOptsSchema } from "./act.js";
import { type ActResult } from "./ActResult.js";
import { type LLMNamespace } from "./LLMNamespace.js";
import { OngoingPrediction } from "./OngoingPrediction.js";
import { PredictionResult } from "./PredictionResult.js";
import { type Tool, toolToLLMTool } from "./tool.js";
import { ToolCallRequestError } from "./ToolCallRequestError.js";

/**
 * Options for {@link LLMDynamicHandle#complete}.
 *
 * Note, this interface extends {@link LLMPredictionConfigInput}. See its documentation for more
 * fields.
 *
 * Alternatively, use your IDE/editor's intellisense to see the fields.
 *
 * @public
 */
export interface LLMPredictionOpts<TStructuredOutputType = unknown>
  extends LLMPredictionConfigInput<TStructuredOutputType> {
  /**
   * A callback that is called when the model is processing the prompt. The callback is called with
   * a number between 0 and 1, representing the progress of the prompt processing.
   *
   * Prompt processing progress callbacks will only be called before the first token is emitted.
   */
  onPromptProcessingProgress?: (progress: number) => void;
  /**
   * A callback that is called when the model has output the first token.
   */
  onFirstToken?: () => void;
  /**
   * A callback for each fragment that is output by the model.
   */
  onPredictionFragment?: (fragment: LLMPredictionFragment) => void;
  /**
   * A callback that is called when the model starts generating a tool call request.
   *
   * This hook is intended for updating the UI, such as showing "XXX is planning to use a tool...".
   * At this stage the tool call request has not been generated thus we don't know what tool will be
   * called. It is guaranteed that each `invocation` of `onToolCallRequestStart` is paired with
   * exactly one `onToolCallRequestEnd` or `onToolCallRequestFailure`.
   *
   * @experimental [EXP-NON-ACT-TOOL-CALLBACKS] Tool call callbacks in .respond/.complete is in an
   * experimental feature. This may change in the future without warning.
   */
  onToolCallRequestStart?: (
    callId: number,
    info: {
      /**
       * The LLM-specific tool call ID that should go into the context. This will be the same as the
       * `toolCallRequest.id`. Depending on the LLM, this may or may not exist, and the format of it
       * may also vary.
       *
       * If you need to match up different stages of the tool call, please use the `callId`, which
       * is provided by lmstudio.js and is guaranteed to behave consistently across all LLMs.
       */
      toolCallId?: string;
    },
  ) => void;
  /**
   * A callback that is called when the model has received the name of the tool.
   *
   * This hook is intended for updating the UI to show the name of the tool that is being called. If
   * the model being used does not support eager function name reporting, this callback will be
   * called right before the `onToolCallRequestEnd` callback.
   *
   * @experimental [EXP-NON-ACT-TOOL-CALLBACKS] Tool call callbacks in .respond/.complete is in an
   * experimental feature. This may change in the future without warning.
   */
  onToolCallRequestNameReceived?: (callId: number, name: string) => void;
  /**
   * A callback that is called when the model has generated a fragment of the arguments of the tool.
   *
   * This hook is intended for updating the UI to stream the arguments of the tool that is being
   * called. If the model being used does not support function arguments streaming, this callback
   * will be called right before the `onToolCallRequestEnd` callback, but after the
   * `onToolCallRequestNameReceived`.
   *
   * Note, when piecing together all the argument fragments, there is no guarantee that the result
   * will be valid JSON, as some models may not use JSON to represent tool calls.
   *
   * @experimental [EXP-NON-ACT-TOOL-CALLBACKS] Tool call callbacks in .respond/.complete is in an
   * experimental feature. This may change in the future without warning.
   */
  onToolCallRequestArgumentFragmentGenerated?: (callId: number, content: string) => void;
  /**
   * A callback that is called when a tool call is requested by the model.
   *
   * @experimental [EXP-NON-ACT-TOOL-CALLBACKS] Tool call callbacks in .respond/.complete is in an
   * experimental feature. This may change in the future without warning.
   */
  onToolCallRequestEnd?: (
    callId: number,
    info: {
      /**
       * The tool call request that was generated by the model. This field is especially unstable
       * as we will likely replace it with a nicer type.
       */
      toolCallRequest: ToolCallRequest;
      /**
       * The raw output that represents this tool call. It is recommended to present this to
       * the user as is, if desired.
       *
       * @remarks It is not guaranteed to be valid JSON as the model does not necessarily use
       * JSON to represent tool calls.
       */
      rawContent: string | undefined;
    },
  ) => void;
  /**
   * A callback that is called when a tool call has failed to generate.
   *
   * @experimental [EXP-NON-ACT-TOOL-CALLBACKS] Tool call callbacks in .respond/.complete is in an
   * experimental feature. This may change in the future without warning.
   */
  onToolCallRequestFailure?: (callId: number, error: ToolCallRequestError) => void;
  /**
   * An abort signal that can be used to cancel the prediction.
   */
  signal?: AbortSignal;
  /**
   * Which preset to use.
   *
   * @remarks
   *
   * This preset selection is "layered" between your overrides and the "server session" config.
   * Which means, other fields you specify in this opts object will override the preset, while the
   * preset content will override the "server session" config.
   */
  preset?: string;
}
const llmPredictionOptsSchema = llmPredictionConfigInputSchema.extend({
  onPromptProcessingProgress: z.function().optional(),
  onFirstToken: z.function().optional(),
  onPredictionFragment: z.function().optional(),
  onToolCallRequestStart: z.function().optional(),
  onToolCallRequestNameReceived: z.function().optional(),
  onToolCallRequestArgumentFragmentGenerated: z.function().optional(),
  onToolCallRequestEnd: z.function().optional(),
  onToolCallRequestFailure: z.function().optional(),
  signal: z.instanceof(AbortSignal).optional(),
  preset: z.string().optional(),
});

type LLMPredictionExtraOpts<TStructuredOutputType = unknown> = Omit<
  LLMPredictionOpts<TStructuredOutputType>,
  keyof LLMPredictionConfigInput<TStructuredOutputType>
>;

function splitPredictionOpts<TStructuredOutputType>(
  opts: LLMPredictionOpts<TStructuredOutputType>,
): [
  LLMPredictionConfigInput<TStructuredOutputType>,
  LLMPredictionExtraOpts<TStructuredOutputType>,
] {
  const {
    onPromptProcessingProgress,
    onFirstToken,
    onPredictionFragment,
    onToolCallRequestStart,
    onToolCallRequestNameReceived,
    onToolCallRequestArgumentFragmentGenerated,
    onToolCallRequestEnd,
    onToolCallRequestFailure,
    signal,
    preset,
    ...config
  } = opts;
  return [
    config,
    {
      onPromptProcessingProgress,
      onFirstToken,
      onPredictionFragment,
      onToolCallRequestStart,
      onToolCallRequestNameReceived,
      onToolCallRequestArgumentFragmentGenerated,
      onToolCallRequestEnd,
      onToolCallRequestFailure,
      signal,
      preset,
    },
  ];
}

/**
 * Options for {@link LLMDynamicHandle#respond}.
 *
 * Note, this interface extends {@link LLMPredictionOpts} and {@link LLMPredictionConfigInput}. See
 * their documentation for more fields.
 *
 * Alternatively, use your IDE/editor's intellisense to see the fields.
 *
 * @public
 */
export interface LLMRespondOpts<TStructuredOutputType = unknown>
  extends LLMPredictionOpts<TStructuredOutputType> {
  /**
   * A convenience callback that is called when the model finishes generation. The callback is
   * called with a message that has the role set to "assistant" and the content set to the generated
   * text.
   *
   * This callback is useful if you want to add the generated message to a chat.
   *
   * For example:
   *
   * ```ts
   * const chat = Chat.empty();
   * chat.append("user", "When will The Winds of Winter be released?");
   *
   * const llm = client.llm.model();
   * const prediction = llm.respond(chat, {
   *   onMessage: message => chat.append(message),
   * });
   * ```
   */
  onMessage?: (message: ChatMessage) => void;
}
const llmRespondOptsSchema = llmPredictionOptsSchema.extend({
  onMessage: z.function().optional(),
  onToolCallRequestStart: z.function().optional(),
  onToolCallRequestNameReceived: z.function().optional(),
  onToolCallRequestArgumentFragmentGenerated: z.function().optional(),
  onToolCallRequestEnd: z.function().optional(),
  onToolCallRequestFailure: z.function().optional(),
});

type LLMRespondExtraOpts<TStructuredOutputType = unknown> = Omit<
  LLMRespondOpts<TStructuredOutputType>,
  keyof LLMPredictionOpts<TStructuredOutputType>
>;

/**
 * Split a llmRespondOpts into its parts.
 */
function splitRespondOpts<TStructuredOutputType>(
  opts: LLMRespondOpts<TStructuredOutputType>,
): [
  LLMPredictionConfigInput<TStructuredOutputType>,
  LLMPredictionExtraOpts<TStructuredOutputType>,
  LLMRespondExtraOpts<TStructuredOutputType>,
] {
  const { onMessage, ...remaining } = opts;
  const [config, llmPredictionOpts] = splitPredictionOpts(remaining);
  return [
    config,
    llmPredictionOpts,
    {
      onMessage,
    },
  ];
}

/**
 * A {@link LLMPredictionFragment} with the index of the prediction within `.act(...)`.
 *
 * See {@link LLMPredictionFragment} for more fields.
 *
 * @public
 */
export type LLMPredictionFragmentWithRoundIndex = LLMPredictionFragment & {
  roundIndex: number;
};

/**
 * Options for {@link LLMDynamicHandle#act}.
 *
 * @public
 */
export type LLMActionOpts<TStructuredOutputType = unknown> =
  LLMPredictionConfigInput<TStructuredOutputType> &
    LLMActBaseOpts<PredictionResult> & {
      /**
       * Which preset to use.
       *
       * @remarks
       *
       * This preset selection is "layered" between your overrides and the "server session" config.
       * Which means, other fields you specify in this opts object will override the preset, while the
       * preset content will override the "server session" config.
       */
      preset?: string;
    };
const llmActionOptsSchema = llmPredictionConfigInputSchema
  .extend(llmActBaseOptsSchema.shape)
  .extend({
    preset: z.string().optional(),
  }) satisfies ZodSchema<LLMActionOpts<unknown>>;

type LLMActExtraOpts<TStructuredOutputType = unknown> = Omit<
  LLMActionOpts<TStructuredOutputType>,
  keyof LLMPredictionConfigInput<TStructuredOutputType>
>;

function splitActOpts<TStructuredOutputType>(
  opts: LLMActionOpts<TStructuredOutputType>,
): [LLMPredictionConfigInput<TStructuredOutputType>, LLMActExtraOpts<TStructuredOutputType>] {
  const {
    onFirstToken,
    onPredictionFragment,
    onMessage,
    onRoundStart,
    onRoundEnd,
    onPredictionCompleted,
    onPromptProcessingProgress,
    onToolCallRequestStart,
    onToolCallRequestNameReceived,
    onToolCallRequestArgumentFragmentGenerated,
    onToolCallRequestEnd,
    onToolCallRequestFinalized,
    onToolCallRequestFailure,
    onToolCallRequestDequeued,
    onToolCallResult,
    guardToolCall,
    handleInvalidToolRequest,
    maxPredictionRounds,
    signal,
    preset,
    allowParallelToolExecution,
    ...config
  } = opts;
  return [
    config,
    {
      onFirstToken,
      onPredictionFragment,
      onMessage,
      onRoundStart,
      onRoundEnd,
      onPredictionCompleted,
      onPromptProcessingProgress,
      onToolCallRequestStart,
      onToolCallRequestNameReceived,
      onToolCallRequestArgumentFragmentGenerated,
      onToolCallRequestEnd,
      onToolCallRequestFinalized,
      onToolCallRequestFailure,
      onToolCallRequestDequeued,
      onToolCallResult,
      guardToolCall,
      handleInvalidToolRequest,
      maxPredictionRounds,
      signal,
      preset,
      allowParallelToolExecution,
    },
  ];
}

const noFormattingTemplate = text`
  {% for message in messages %}{{ message['content'] }}{% endfor %}
`;

/**
 * This represents a set of requirements for a model. It is not tied to a specific model, but rather
 * to a set of requirements that a model must satisfy.
 *
 * For example, if you got the model via `client.llm.model("my-identifier")`, you will get a
 * `LLMDynamicHandle` for the model with the identifier `my-identifier`. If the model is unloaded,
 * and another model is loaded with the same identifier, using the same `LLMDynamicHandle` will use
 * the new model.
 *
 * @public
 */
export class LLMDynamicHandle extends DynamicHandle<
  // prettier-ignore
  /** @internal */ LLMPort,
  LLMInstanceInfo
> {
  /**
   * Don't construct this on your own. Use {@link LLMNamespace#model} or
   * {@link LLMNamespace#createDynamicHandle} instead.
   *
   * @internal
   */
  public constructor(
    /** @internal */
    port: LLMPort,
    /** @internal */
    specifier: ModelSpecifier,
    /** @internal */
    private readonly validator: Validator,
    /** @internal */
    private readonly logger: SimpleLogger = new SimpleLogger(`LLMModel`),
  ) {
    super(port, specifier);
  }

  /** @internal */
  private readonly internalKVConfigStack: KVConfigStack = { layers: [] };

  /** @internal */
  private readonly internalIgnoreServerSessionConfig: boolean | undefined = undefined;

  /** @internal */
  private internalPredict(
    history: ChatHistoryData,
    predictionConfigStack: KVConfigStack,
    cancelEvent: BufferedEvent<void>,
    extraOpts: LLMPredictionExtraOpts,
    onFragment: (fragment: LLMPredictionFragment) => void,
    onFinished: (
      stats: LLMPredictionStats,
      modelInfo: LLMInstanceInfo,
      loadModelConfig: KVConfig,
      predictionConfig: KVConfig,
    ) => void,
    onError: (error: Error) => void,
  ) {
    let finished = false;
    let firstTokenTriggered = false;
    let currentCallId: number | null = null;
    let receivedEagerToolNameReporting = false;
    let receivedToolArgumentsStreaming = false;
    const channel = this.port.createChannel(
      "predict",
      {
        modelSpecifier: this.specifier,
        history,
        predictionConfigStack,
        fuzzyPresetIdentifier: extraOpts.preset,
        ignoreServerSessionConfig: this.internalIgnoreServerSessionConfig,
      },
      message => {
        switch (message.type) {
          case "fragment": {
            if (!firstTokenTriggered) {
              firstTokenTriggered = true;
              safeCallCallback(this.logger, "onFirstToken", extraOpts.onFirstToken, []);
            }
            safeCallCallback(this.logger, "onFragment", extraOpts.onPredictionFragment, [
              message.fragment,
            ]);
            onFragment(message.fragment);
            break;
          }
          case "promptProcessingProgress": {
            safeCallCallback(
              this.logger,
              "onPromptProcessingProgress",
              extraOpts.onPromptProcessingProgress,
              [message.progress],
            );
            break;
          }
          case "toolCallGenerationStart": {
            if (currentCallId === null) {
              currentCallId = 0;
            } else {
              currentCallId++;
            }
            receivedEagerToolNameReporting = false;
            receivedToolArgumentsStreaming = false;
            safeCallCallback(
              this.logger,
              "onToolCallGenerationStart",
              extraOpts.onToolCallRequestStart,
              [currentCallId, { toolCallId: message.toolCallId }],
            );
            break;
          }
          case "toolCallGenerationNameReceived": {
            receivedEagerToolNameReporting = true;
            safeCallCallback(
              this.logger,
              "onToolCallGenerationNameReceived",
              extraOpts.onToolCallRequestNameReceived,
              [currentCallId ?? -1, message.name],
            );
            break;
          }
          case "toolCallGenerationArgumentFragmentGenerated": {
            receivedToolArgumentsStreaming = true;
            safeCallCallback(
              this.logger,
              "onToolCallGenerationArgumentFragmentGenerated",
              extraOpts.onToolCallRequestArgumentFragmentGenerated,
              [currentCallId ?? -1, message.content],
            );
            break;
          }
          case "toolCallGenerationEnd": {
            if (!receivedEagerToolNameReporting) {
              // If eager name reporting not received, report it.
              safeCallCallback(
                this.logger,
                "onToolCallGenerationNameReceived",
                extraOpts.onToolCallRequestNameReceived,
                [currentCallId ?? -1, message.toolCallRequest.name],
              );
            }
            if (!receivedToolArgumentsStreaming) {
              // If arguments streaming not received, just pretend we have received all the
              // arguments as a single JSON
              safeCallCallback(
                this.logger,
                "onToolCallGenerationArgumentFragmentGenerated",
                extraOpts.onToolCallRequestArgumentFragmentGenerated,
                [
                  currentCallId ?? -1,
                  JSON.stringify(message.toolCallRequest.arguments ?? {}, null, 2),
                ],
              );
            }

            safeCallCallback(
              this.logger,
              "onToolCallGenerationEnd",
              extraOpts.onToolCallRequestEnd,
              [
                currentCallId ?? -1,
                { toolCallRequest: message.toolCallRequest, rawContent: message.rawContent },
              ],
            );
            break;
          }
          case "toolCallGenerationFailed": {
            const toolCallRequestError = new ToolCallRequestError(
              fromSerializedError(message.error).message,
              message.rawContent,
            );
            safeCallCallback(
              this.logger,
              "onToolCallGenerationFailed",
              extraOpts.onToolCallRequestFailure,
              [currentCallId ?? -1, toolCallRequestError],
            );
            break;
          }
          case "success": {
            finished = true;
            onFinished(
              message.stats,
              message.modelInfo,
              message.loadModelConfig,
              message.predictionConfig,
            );
            break;
          }
        }
      },
      { stack: getCurrentStack(2) },
    );
    cancelEvent.subscribeOnce(() => {
      if (finished) {
        return;
      }
      channel.send({ type: "cancel" });
    });
    channel.onError.subscribeOnce(onError);
  }

  private predictionConfigInputToKVConfig(config: LLMPredictionConfigInput): KVConfig {
    let structuredField: undefined | LLMStructuredPredictionSetting = undefined;
    if (typeof (config.structured as any)?.parse === "function") {
      structuredField = {
        type: "json",
        jsonSchema: zodToJsonSchema(config.structured as any),
      };
    } else {
      structuredField = config.structured as any;
    }
    const convertedConfig = {
      ...config,
      structured: structuredField,
    };
    return llmPredictionConfigToKVConfig(convertedConfig);
  }

  private createZodParser(zodSchema: ZodSchema): (content: string) => any {
    return content => {
      try {
        return zodSchema.parse(JSON.parse(content));
      } catch (e) {
        throw new Error("Failed to parse structured output: " + JSON.stringify(content), {
          cause: e,
        });
      }
    };
  }

  /**
   * Use the loaded model to predict text.
   *
   * This method returns an {@link OngoingPrediction} object. An ongoing prediction can be used as a
   * promise (if you only care about the final result) or as an async iterable (if you want to
   * stream the results as they are being generated).
   *
   * Example usage as a promise (Resolves to a {@link PredictionResult}):
   *
   * ```typescript
   * const result = await model.complete("When will The Winds of Winter be released?");
   * console.log(result.content);
   * ```
   *
   * Or
   *
   * ```typescript
   * model.complete("When will The Winds of Winter be released?")
   *  .then(result =\> console.log(result.content))
   *  .catch(error =\> console.error(error));
   * ```
   *
   * Example usage as an async iterable (streaming):
   *
   * ```typescript
   * for await (const { content } of model.complete("When will The Winds of Winter be released?")) {
   *   process.stdout.write(content);
   * }
   * ```
   *
   * If you wish to stream the result, but also getting the final prediction results (for example,
   * you wish to get the prediction stats), you can use the following pattern:
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
   * @param prompt - The prompt to use for prediction.
   * @param opts - Options for the prediction.
   */
  public complete<TStructuredOutputType>(
    prompt: string,
    opts: LLMPredictionOpts<TStructuredOutputType> = {},
  ): OngoingPrediction<TStructuredOutputType> {
    const stack = getCurrentStack(1);
    [prompt, opts] = this.validator.validateMethodParamsOrThrow(
      "model",
      "complete",
      ["prompt", "opts"],
      [z.string(), llmPredictionOptsSchema],
      [prompt, opts],
      stack,
    );
    const [config, extraOpts] = splitPredictionOpts(opts);
    const [cancelEvent, emitCancelEvent] = BufferedEvent.create<void>();

    if (extraOpts.signal !== undefined) {
      if (extraOpts.signal.aborted) {
        // If the signal is already aborted, we need to cancel the prediction immediately.
        emitCancelEvent();
      } else {
        extraOpts.signal.addEventListener(
          "abort",
          () => {
            emitCancelEvent();
          },
          { once: true },
        );
      }
    }

    const zodSchemaParseResult = zodSchemaSchema.safeParse(config.structured);
    const { ongoingPrediction, finished, failed, push } = OngoingPrediction.create(
      emitCancelEvent,
      !zodSchemaParseResult.success ? null : this.createZodParser(zodSchemaParseResult.data),
    );

    this.internalPredict(
      this.resolveCompletionContext(prompt),
      {
        layers: [
          ...this.internalKVConfigStack.layers,
          {
            layerName: "apiOverride",
            config: this.predictionConfigInputToKVConfig({
              // If the user did not specify `stopStrings`, we default to an empty array. This is to
              // prevent the model from using the value set in the preset.
              stopStrings: [],
              ...config,
            }),
          },
          {
            layerName: "completeModeFormatting",
            config: llmSharedPredictionConfigSchematics.buildPartialConfig({
              promptTemplate: {
                type: "jinja",
                jinjaPromptTemplate: {
                  template: noFormattingTemplate,
                },
                stopStrings: [],
              },
            }),
          },
        ],
      },
      cancelEvent,
      extraOpts,
      fragment => push(fragment),
      (stats, modelInfo, loadModelConfig, predictionConfig) =>
        finished(stats, modelInfo, loadModelConfig, predictionConfig),
      error => failed(error),
    );
    return ongoingPrediction;
  }

  private resolveCompletionContext(contextInput: string): ChatHistoryData {
    return {
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: contextInput }],
        },
      ],
    };
  }

  /**
   * Use the loaded model to generate a response based on the given history.
   *
   * This method returns an {@link OngoingPrediction} object. An ongoing prediction can be used as a
   * promise (if you only care about the final result) or as an async iterable (if you want to
   * stream the results as they are being generated).
   *
   * Example usage as a promise (Resolves to a {@link PredictionResult}):
   *
   * ```typescript
   * const history = [{ role: 'user', content: "When will The Winds of Winter be released?" }];
   * const result = await model.respond(history);
   * console.log(result.content);
   * ```
   *
   * Or
   *
   * ```typescript
   * const history = [{ role: 'user', content: "When will The Winds of Winter be released?" }];
   * model.respond(history)
   *  .then(result => console.log(result.content))
   *  .catch(error => console.error(error));
   * ```
   *
   * Example usage as an async iterable (streaming):
   *
   * ```typescript
   * const history = [{ role: 'user', content: "When will The Winds of Winter be released?" }];
   * for await (const { content } of model.respond(history)) {
   *   process.stdout.write(content);
   * }
   * ```
   *
   * If you wish to stream the result, but also getting the final prediction results (for example,
   * you wish to get the prediction stats), you can use the following pattern:
   *
   * ```typescript
   * const history = [{ role: 'user', content: "When will The Winds of Winter be released?" }];
   * const prediction = model.respond(history);
   * for await (const { content } of prediction) {
   *   process.stdout.write(content);
   * }
   * const result = await prediction;
   * console.log(result.stats);
   * ```
   *
   * @param chat - The LLMChatHistory array to use for generating a response.
   * @param opts - Options for the prediction.
   */
  public respond<TStructuredOutputType>(
    chat: ChatLike,
    opts: LLMRespondOpts<TStructuredOutputType> = {},
  ): OngoingPrediction<TStructuredOutputType> {
    const stack = getCurrentStack(1);
    [chat, opts] = this.validator.validateMethodParamsOrThrow(
      "model",
      "respond",
      ["chat", "opts"],
      [chatHistoryLikeSchema, llmRespondOptsSchema],
      [chat, opts],
      stack,
    );
    const [cancelEvent, emitCancelEvent] = BufferedEvent.create<void>();
    const [config, predictionOpts, respondOpts] = splitRespondOpts(opts);

    if (predictionOpts.signal !== undefined) {
      if (predictionOpts.signal.aborted) {
        // If the signal is already aborted, we need to cancel the prediction immediately.
        emitCancelEvent();
      } else {
        predictionOpts.signal.addEventListener(
          "abort",
          () => {
            emitCancelEvent();
          },
          { once: true },
        );
      }
    }

    const zodSchemaParseResult = zodSchemaSchema.safeParse(config.structured);
    const { ongoingPrediction, finished, failed, push } = OngoingPrediction.create(
      emitCancelEvent,
      !zodSchemaParseResult.success ? null : this.createZodParser(zodSchemaParseResult.data),
    );

    this.internalPredict(
      accessMaybeMutableInternals(Chat.from(chat))._internalGetData(),
      addKVConfigToStack(
        this.internalKVConfigStack,
        "apiOverride",
        this.predictionConfigInputToKVConfig(config),
      ),
      cancelEvent,
      predictionOpts,
      fragment => push(fragment),
      (stats, modelInfo, loadModelConfig, predictionConfig) =>
        finished(stats, modelInfo, loadModelConfig, predictionConfig),
      error => failed(error),
    );
    ongoingPrediction.then(
      result => {
        // Call the onMessage callback with the result.
        safeCallCallback(this.logger, "onMessage", respondOpts.onMessage, [
          ChatMessage.create("assistant", result.content),
        ]);
      },
      () => {}, // Eat the error, as we don't want to throw it here.
    );
    return ongoingPrediction;
  }

  /**
   * @param chat - The LLMChatHistory array to act from as the base
   * @param tool - An array of tools that the model can use during the operation. You can create
   * tools by using the `tool` function.
   * @param opts - Additional options
   *
   * Example:
   *
   * ```
   * import { LMStudioClient, tool } from "@lmstudio/sdk";
   * import { z } from "zod";
   *
   * const client = new LMStudioClient();
   * const model = await client.llm.model();
   *
   * const additionTool = tool({
   *   name: "add",
   *   description: "Add two numbers",
   *   parameters: {
   *     a: z.number(),
   *     b: z.number(),
   *   },
   *   implementation: ({ a, b }) => a + b,
   * });
   *
   * await model.act("What is 1234 + 4321?", [additionTool], {
   *   onMessage: message => console.log(message.toString()),
   * });
   * ```
   */
  public async act(
    chat: ChatLike,
    tools: Array<Tool>,
    opts: LLMActionOpts = {},
  ): Promise<ActResult> {
    const startTime = performance.now();
    const stack = getCurrentStack(1);
    [chat, opts] = this.validator.validateMethodParamsOrThrow(
      "model",
      "act",
      ["chat", "opts"],
      [chatHistoryLikeSchema, llmActionOptsSchema],
      [chat, opts],
      stack,
    );

    const [config, { preset, ...baseOpts }] = splitActOpts(opts);

    if (
      config.structured !== undefined &&
      (config.structured as any).type !== "none" &&
      tools.length > 0
    ) {
      throw makePrettyError(
        "Structured output is currently not supported in .act() when there are tools.",
        stack,
      );
    }
    if (config.structured !== undefined && (config.structured as any).parse !== undefined) {
      throw makePrettyError("zod schema is not supported in .act().", stack);
    }
    if (config.rawTools !== undefined) {
      throw makePrettyError("`rawTools` is not supported in act. Use `tools` instead", stack);
    }

    let rawTools: LLMToolUseSetting;

    if (tools.length === 0) {
      rawTools = { type: "none" };
    } else {
      rawTools = {
        type: "toolArray",
        tools: tools.map(toolToLLMTool),
      };
    }

    const configWithTools = addKVConfigToStack(
      this.internalKVConfigStack,
      "apiOverride",
      this.predictionConfigInputToKVConfig({
        ...config,
        rawTools,
      }),
    );
    const configWithoutTools = addKVConfigToStack(
      this.internalKVConfigStack,
      "apiOverride",
      this.predictionConfigInputToKVConfig({
        ...config,
        rawTools: { type: "none" },
        toolChoice: { type: "generic", mode: "auto" },
      }),
    );

    /**
     * The type that is created upon receiving an "success" message. This type is then passed to the
     * `makePredictionResult` function to create the final PredictionResult.
     */
    interface EndPacket {
      stats: LLMPredictionStats;
      modelInfo: LLMInstanceInfo;
      loadModelConfig: KVConfig;
      predictionConfig: KVConfig;
    }

    return await internalAct<PredictionResult, EndPacket>(
      chat,
      tools,
      baseOpts,
      stack,
      this.logger,
      startTime,
      // Implementation of the prediction function. This performs the prediction by creating a
      // predict channel and redirect the messages to the appropriate handlers.
      async ({
        allowTools,
        history,
        signal,
        handleFragment,
        handlePromptProcessingProgress,
        handleToolCallGenerationStart,
        handleToolCallGenerationNameReceived,
        handleToolCallGenerationArgumentFragmentGenerated,
        handleToolCallGenerationEnd,
        handleToolCallGenerationFailed,
        handlePredictionEnd,
        handleError,
      }) => {
        // Use predict channel
        const channel = this.port.createChannel(
          "predict",
          {
            modelSpecifier: this.specifier,
            history,
            predictionConfigStack: allowTools ? configWithTools : configWithoutTools,
            fuzzyPresetIdentifier: preset,
            ignoreServerSessionConfig: this.internalIgnoreServerSessionConfig,
          },
          message => {
            const messageType = message.type;
            switch (messageType) {
              case "fragment": {
                handleFragment(message.fragment);
                break;
              }
              case "promptProcessingProgress": {
                handlePromptProcessingProgress(message.progress);
                break;
              }
              case "toolCallGenerationStart": {
                handleToolCallGenerationStart(message.toolCallId);
                break;
              }
              case "toolCallGenerationNameReceived": {
                handleToolCallGenerationNameReceived(message.name);
                break;
              }
              case "toolCallGenerationArgumentFragmentGenerated": {
                handleToolCallGenerationArgumentFragmentGenerated(message.content);
                break;
              }
              case "toolCallGenerationEnd": {
                handleToolCallGenerationEnd(message.toolCallRequest, message.rawContent);
                break;
              }
              case "toolCallGenerationFailed": {
                handleToolCallGenerationFailed(
                  fromSerializedError(message.error),
                  message.rawContent,
                );
                break;
              }
              case "success": {
                // This is the end of the prediction. The following object is passed to the
                // `makePredictionResult` function to create the final PredictionResult. (see below)
                handlePredictionEnd({
                  stats: message.stats,
                  modelInfo: message.modelInfo,
                  loadModelConfig: message.loadModelConfig,
                  predictionConfig: message.predictionConfig,
                });
                break;
              }
            }
          },
          { stack },
        );
        if (signal.aborted) {
          // If the signal is already aborted, we need to cancel the prediction immediately.
          channel.send({ type: "cancel" });
        } else {
          signal.addEventListener(
            "abort",
            () => {
              channel.send({ type: "cancel" });
            },
            { once: true },
          );
        }
        channel.onError.subscribeOnce(handleError);
      },
      ({ endPacket, content, nonReasoningContent, reasoningContent, predictionsPerformed }) => {
        return new PredictionResult(
          content,
          reasoningContent,
          nonReasoningContent,
          endPacket.stats,
          endPacket.modelInfo,
          predictionsPerformed,
          endPacket.loadModelConfig,
          endPacket.predictionConfig,
        );
      },
    );
  }

  public async getContextLength(): Promise<number> {
    const stack = getCurrentStack(1);
    const loadConfig = await this.getLoadKVConfig(stack);
    return llmSharedLoadConfigSchematics.access(loadConfig, "contextLength");
  }

  public async applyPromptTemplate(
    history: ChatLike,
    opts: LLMApplyPromptTemplateOpts = {},
  ): Promise<string> {
    const stack = getCurrentStack(1);
    [history, opts] = this.validator.validateMethodParamsOrThrow(
      "model",
      "applyPromptTemplate",
      ["history", "opts"],
      [chatHistoryLikeSchema, llmApplyPromptTemplateOptsSchema],
      [history, opts],
      stack,
    );
    return (
      await this.port.callRpc(
        "applyPromptTemplate",
        {
          specifier: this.specifier,
          history: accessMaybeMutableInternals(Chat.from(history))._internalGetData(),
          predictionConfigStack: this.internalKVConfigStack,
          opts,
        },
        {
          stack,
        },
      )
    ).formatted;
  }

  public async tokenize(inputString: string): Promise<Array<number>>;
  public async tokenize(inputStrings: Array<string>): Promise<Array<Array<number>>>;
  public async tokenize(
    inputString: string | Array<string>,
  ): Promise<Array<number> | Array<Array<number>>> {
    const stack = getCurrentStack(1);
    inputString = this.validator.validateMethodParamOrThrow(
      "model",
      "tokenize",
      "inputString",
      z.string().or(z.array(z.string())),
      inputString,
      stack,
    );
    if (Array.isArray(inputString)) {
      return (
        await Promise.all(
          inputString.map(s =>
            this.port.callRpc("tokenize", { specifier: this.specifier, inputString: s }, { stack }),
          ),
        )
      ).map(r => r.tokens);
    } else {
      return (
        await this.port.callRpc(
          "tokenize",
          {
            specifier: this.specifier,
            inputString,
          },
          { stack },
        )
      ).tokens;
    }
  }

  public async countTokens(inputString: string): Promise<number> {
    const stack = getCurrentStack(1);
    inputString = this.validator.validateMethodParamOrThrow(
      "model",
      "countTokens",
      "inputString",
      z.string(),
      inputString,
      stack,
    );
    return (
      await this.port.callRpc(
        "countTokens",
        {
          specifier: this.specifier,
          inputString,
        },
        { stack },
      )
    ).tokenCount;
  }

  /**
   * Starts to eagerly preload a draft model. This is useful when you want a draft model to be ready
   * for speculative decoding.
   *
   * Preloading is done on a best-effort basis and may not always succeed. It is not guaranteed that
   * the draft model is actually loaded when this method returns. Thus, this method should only be
   * used as an optimization. The actual draft model used only depends on the parameter set when
   * performing the prediction.
   */
  public async unstable_preloadDraftModel(draftModelKey: string): Promise<void> {
    const stack = getCurrentStack(1);
    draftModelKey = this.validator.validateMethodParamOrThrow(
      "model",
      "unstable_preloadDraftModel",
      "draftModelKey",
      z.string(),
      draftModelKey,
      stack,
    );
    await this.port.callRpc(
      "preloadDraftModel",
      { specifier: this.specifier, draftModelKey },
      { stack },
    );
  }

  /**
   * Get the configuration used to load the model.
   */
  public async getLoadConfig(): Promise<LLMLoadModelConfig> {
    const stack = getCurrentStack(1);
    const loadConfig = await super.getLoadKVConfig(stack);
    return kvConfigToLLMLoadModelConfig(loadConfig, {
      useDefaultsForMissingKeys: true,
    });
  }

  /**
   * Get the base prediction configuration for the model. This does not include any overrides that
   * may be provided at prediction time.
   */
  public async getBasePredictionConfig(): Promise<LLMPredictionConfig> {
    const stack = getCurrentStack(1);
    const basePredictionConfig = await super.getBasePredictionKVConfig(stack);
    const kvStack = addKVConfigToStack(
      this.internalKVConfigStack,
      "apiOverride",
      basePredictionConfig,
    );
    return kvConfigToLLMPredictionConfig(collapseKVStack(kvStack), {
      useDefaultsForMissingKeys: true,
    });
  }
}
