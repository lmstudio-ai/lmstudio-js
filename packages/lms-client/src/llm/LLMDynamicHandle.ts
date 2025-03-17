import {
  accessMaybeMutableInternals,
  BufferedEvent,
  getCurrentStack,
  makePrettyError,
  makePromise,
  safeCallCallback,
  SimpleLogger,
  text,
  type Validator,
} from "@lmstudio/lms-common";
import { type LLMPort } from "@lmstudio/lms-external-backend-interfaces";
import {
  addKVConfigToStack,
  llmPredictionConfigToKVConfig,
  llmSharedLoadConfigSchematics,
  llmSharedPredictionConfigSchematics,
} from "@lmstudio/lms-kv-config";
import {
  type ChatHistoryData,
  type ChatMessagePartToolCallRequestData,
  type ChatMessagePartToolCallResultData,
  type KVConfig,
  type KVConfigStack,
  type LLMApplyPromptTemplateOpts,
  llmApplyPromptTemplateOptsSchema,
  type LLMInstanceInfo,
  type LLMJinjaInputConfig,
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
import { ActResult } from "./ActResult.js";
import { type LLMNamespace } from "./LLMNamespace.js";
import { OngoingPrediction } from "./OngoingPrediction.js";
import { PredictionResult } from "./PredictionResult.js";
import { type Tool, toolToLLMTool } from "./tool.js";

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
   * An abort signal that can be used to cancel the prediction.
   */
  signal?: AbortSignal;
  /**
   * Which preset to use.
   *
   * @remarks
   *
   * This preset selection is "layered" between your overrides and the "server session" config.
   * Which means, other fields you specify here will override the preset, while the preset content
   * will override the "server session" config.
   */
  preset?: string;
}
const llmPredictionOptsSchema = llmPredictionConfigInputSchema.extend({
  onPromptProcessingProgress: z.function().optional(),
  onFirstToken: z.function().optional(),
  onPredictionFragment: z.function().optional(),
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
    signal,
    preset,
    ...config
  } = opts;
  return [
    config,
    { onPromptProcessingProgress, onFirstToken, onPredictionFragment, signal, preset },
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
  return [config, llmPredictionOpts, { onMessage }];
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
export interface LLMActionOpts<TStructuredOutputType = unknown>
  extends LLMPredictionConfigInput<TStructuredOutputType> {
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
  onPredictionCompleted?: (predictionResult: PredictionResult) => void;
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
  /**
   * Which preset to use.
   *
   * @remarks
   *
   * This preset selection is "layered" between your overrides and the "server session" config.
   * Which means, other fields you specify here will override the preset, while the preset content
   * will override the "server session" config.
   */
  preset?: string;
}
const llmActionOptsSchema = llmPredictionConfigInputSchema.extend({
  onFirstToken: z.function().optional(),
  onPredictionFragment: z.function().optional(),
  onMessage: z.function().optional(),
  onRoundStart: z.function().optional(),
  onRoundEnd: z.function().optional(),
  onPredictionCompleted: z.function().optional(),
  onPromptProcessingProgress: z.function().optional(),
  handleInvalidToolRequest: z.function().optional(),
  maxPredictionRounds: z.number().int().min(1).optional(),
  signal: z.instanceof(AbortSignal).optional(),
  preset: z.string().optional(),
});

const defaultHandleInvalidToolRequest = (error: Error, request: ToolCallRequest | undefined) => {
  if (request) {
    return error.message;
  }
  throw error;
};

type LLMActExtraOpts<TStructuredOutputType = unknown> = Omit<
  LLMActionOpts<TStructuredOutputType>,
  keyof LLMPredictionConfigInput<TStructuredOutputType>
>;

function splitOperationOpts<TStructuredOutputType>(
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
    handleInvalidToolRequest,
    maxPredictionRounds,
    signal,
    preset,
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
      handleInvalidToolRequest,
      maxPredictionRounds,
      signal,
      preset,
    },
  ];
}

const noFormattingTemplate = text`
  {% for message in messages %}{{ message['content'] }}{% endfor %}
`;
const noFormattingInputConfig: LLMJinjaInputConfig = {
  messagesConfig: {
    contentConfig: {
      type: "string",
    },
  },
  useTools: false,
};

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
   * Don't construct this on your own. Use {@link LLMNamespace#get} or {@link LLMNamespace#load}
   * instead.
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
  private predictInternal(
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
          case "fragment":
            if (!firstTokenTriggered) {
              firstTokenTriggered = true;
              safeCallCallback(this.logger, "onFirstToken", extraOpts.onFirstToken, []);
            }
            safeCallCallback(this.logger, "onFragment", extraOpts.onPredictionFragment, [
              message.fragment,
            ]);
            onFragment(message.fragment);
            break;
          case "promptProcessingProgress":
            safeCallCallback(
              this.logger,
              "onPromptProcessingProgress",
              extraOpts.onPromptProcessingProgress,
              [message.progress],
            );
            break;
          case "success":
            finished = true;
            onFinished(
              message.stats,
              message.modelInfo,
              message.loadModelConfig,
              message.predictionConfig,
            );
            break;
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
      extraOpts.signal.addEventListener(
        "abort",
        () => {
          emitCancelEvent();
        },
        { once: true },
      );
    }

    const zodSchemaParseResult = zodSchemaSchema.safeParse(config.structured);
    const { ongoingPrediction, finished, failed, push } = OngoingPrediction.create(
      emitCancelEvent,
      !zodSchemaParseResult.success ? null : this.createZodParser(zodSchemaParseResult.data),
    );

    this.predictInternal(
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
                  bosToken: "",
                  eosToken: "",
                  template: noFormattingTemplate,
                  inputConfig: noFormattingInputConfig,
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
      predictionOpts.signal.addEventListener(
        "abort",
        () => {
          emitCancelEvent();
        },
        { once: true },
      );
    }

    const zodSchemaParseResult = zodSchemaSchema.safeParse(config.structured);
    const { ongoingPrediction, finished, failed, push } = OngoingPrediction.create(
      emitCancelEvent,
      !zodSchemaParseResult.success ? null : this.createZodParser(zodSchemaParseResult.data),
    );

    this.predictInternal(
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
    ongoingPrediction.then(result => {
      // Call the onMessage callback with the result.
      safeCallCallback(this.logger, "onMessage", respondOpts.onMessage, [
        ChatMessage.create("assistant", result.content),
      ]);
    });
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

    const [config, extraOpts] = splitOperationOpts(opts);
    const abortController = new AbortController();
    const mutableChat = Chat.from(chat); // Make a copy

    if (extraOpts.signal !== undefined) {
      extraOpts.signal.addEventListener(
        "abort",
        () => {
          abortController.abort(extraOpts.signal?.reason);
        },
        { once: true },
      );
    }

    if (config.structured !== undefined) {
      throw makePrettyError("Structured output is currently not supported in act.", stack);
    }
    if (config.rawTools !== undefined) {
      throw makePrettyError("`rawTools` is not supported in act. Use `tools` instead", stack);
    }

    let shouldContinue = false;
    let predictionsPerformed = 0;

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
      }),
    );

    const toolsMap = new Map<string, Tool>();
    for (const tool of tools) {
      if (toolsMap.has(tool.name)) {
        this.logger.warnText`
          Duplicate tool (${tool.name}) found in the tools array. The last tool with the same name
          will be used.
        `;
      }
      toolsMap.set(tool.name, tool);
    }

    do {
      // Main loop - execute as many times as the model requests tools
      let configToUse: KVConfigStack = configWithTools;
      if (
        // If there is a defined number of max predictions,
        extraOpts.maxPredictionRounds !== undefined &&
        // ... and this is the last chance to perform predictions, don't allow the model to use
        // tools.
        predictionsPerformed + 1 >= extraOpts.maxPredictionRounds
      ) {
        configToUse = configWithoutTools;
      }

      // Start the prediction
      let finished = false;
      let firstTokenTriggered = false;
      const contentArray: Array<string> = [];

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
          result = await (extraOpts.handleInvalidToolRequest ?? defaultHandleInvalidToolRequest)(
            error,
            request,
          );
        } catch (error) {
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
          this.logger.warnText`
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
      safeCallCallback(this.logger, "onRoundStart", extraOpts.onRoundStart, [predictionsPerformed]);

      const channel = this.port.createChannel(
        "predict",
        {
          modelSpecifier: this.specifier,
          history: accessMaybeMutableInternals(mutableChat)._internalGetData(),
          predictionConfigStack: configToUse,
          fuzzyPresetIdentifier: extraOpts.preset,
          ignoreServerSessionConfig: this.internalIgnoreServerSessionConfig,
        },
        message => {
          switch (message.type) {
            case "fragment": {
              if (!firstTokenTriggered) {
                firstTokenTriggered = true;
                safeCallCallback(this.logger, "onFirstToken", extraOpts.onFirstToken, [
                  predictionsPerformed,
                ]);
              }
              safeCallCallback(this.logger, "onFragment", extraOpts.onPredictionFragment, [
                { roundIndex: predictionsPerformed, ...message.fragment },
              ]);
              contentArray.push(message.fragment.content);
              break;
            }
            case "promptProcessingProgress": {
              safeCallCallback(
                this.logger,
                "onPromptProcessingProgress",
                extraOpts.onPromptProcessingProgress,
                [predictionsPerformed, message.progress],
              );
              break;
            }
            case "toolCallGenerationEnd": {
              const toolCallIndex = nextToolCallIndex;
              nextToolCallIndex++;
              // We have now received a tool call request. Now let's see if we can call the tool and
              // get the result.
              const toolCallRequest = message.toolCallRequest;
              toolCallRequests.push(toolCallRequest);
              const tool = toolsMap.get(toolCallRequest.name);
              if (tool === undefined) {
                // Tool does not exist.
                toolCallPromises.push(
                  internalHandleInvalidToolCallRequest(
                    new Error(`Cannot find tool with name ${toolCallRequest.name}.`),
                    toolCallRequest,
                    toolCallIndex,
                  ).catch(finalReject),
                );
                break;
              }
              const parseResult = tool.parametersSchema.safeParse(toolCallRequest.arguments ?? {});
              if (!parseResult.success) {
                // Failed to parse the parameters
                toolCallPromises.push(
                  internalHandleInvalidToolCallRequest(
                    new Error(text`
                      Failed to parse arguments for tool ${toolCallRequest.name}:
                      ${parseResult.error.message}
                    `),
                    toolCallRequest,
                    toolCallIndex,
                  ).catch(finalReject),
                );
                break;
              }
              // We have successfully parsed the parameters. Let's call the tool.
              toolCallPromises.push(
                (async () => {
                  const result = await tool.implementation(parseResult.data);
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
                      toolCallId: toolCallRequest.id,
                      content: resultString,
                    },
                  });
                })().catch(finalReject),
              );
              break;
            }
            case "toolCallGenerationFailed": {
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
              break;
            }
            case "success": {
              const predictionResult = new PredictionResult(
                contentArray.join(""),
                message.stats,
                message.modelInfo,
                predictionsPerformed,
                message.loadModelConfig,
                message.predictionConfig,
              );
              safeCallCallback(
                this.logger,
                "onPredictionCompleted",
                extraOpts.onPredictionCompleted,
                [predictionResult],
              );
              predictionResolve();
              break;
            }
          }
        },
        { stack },
      );
      const abortListener = () => {
        if (finished) {
          return;
        }
        finished = true;
        channel.send({ type: "cancel" });
      };
      abortController.signal.addEventListener("abort", abortListener);
      channel.onError.subscribeOnce(error => {
        finished = true;
        predictionReject(error);
      });

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
          safeCallCallback(this.logger, "onMessage", extraOpts.onMessage, [assistantMessage]);
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
        safeCallCallback(this.logger, "onMessage", extraOpts.onMessage, [toolMessage]);
        shouldContinue = true;
      }

      safeCallCallback(this.logger, "onRoundEnd", extraOpts.onRoundEnd, [predictionsPerformed]);

      predictionsPerformed++;
      // Don't continue if we've reached the max predictions.
      if (
        extraOpts.maxPredictionRounds !== undefined &&
        predictionsPerformed >= extraOpts.maxPredictionRounds
      ) {
        shouldContinue = false;
      }
    } while (shouldContinue);
    return new ActResult(predictionsPerformed, (performance.now() - startTime) / 1_000);
  }

  public async getContextLength(): Promise<number> {
    const stack = getCurrentStack(1);
    const loadConfig = await this.getLoadConfig(stack);
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
}
