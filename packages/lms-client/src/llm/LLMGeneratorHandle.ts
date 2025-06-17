import {
  accessMaybeMutableInternals,
  CancelEvent,
  getCurrentStack,
  safeCallCallback,
  SimpleLogger,
  type Validator,
} from "@lmstudio/lms-common";
import { type LLMPort } from "@lmstudio/lms-external-backend-interfaces";
import { emptyKVConfig, singleLayerKVConfigStackOf } from "@lmstudio/lms-kv-config";
import {
  kvConfigSchema,
  type KVConfig,
  type LLMPredictionFragment,
} from "@lmstudio/lms-shared-types";
import { z } from "zod";
import { Chat, chatHistoryLikeSchema, ChatMessage, type ChatLike } from "../Chat.js";
import { internalAct, llmActBaseOptsSchema, type LLMActBaseOpts } from "./act.js";
import { type ActResult } from "./ActResult.js";
import { GeneratorPredictionResult } from "./GeneratorPredictionResult.js";
import { OngoingGeneratorPrediction } from "./OngoingGeneratorPrediction.js";
import { toolToLLMTool, type Tool } from "./tool.js";

/**
 * Options for {@link LLMGeneratorHandle#respond}.
 *
 * @public
 * @deprecated Plugin support is still in development. Stay tuned for updates.
 */
export interface LLMGeneratorPredictionOpts {
  /**
   * A callback that is called when the first token is generated.
   */
  onFirstToken?: () => void;
  /**
   * A callback that is called when a prediction fragment is generated.
   */
  onPredictionFragment?: (fragment: LLMPredictionFragment) => void;
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
   * const generator = client.llm.createGeneratorHandle("lmstudio/some-plugin")
   * const prediction = generator.respond(chat, {
   *   onMessage: message => chat.append(message),
   * });
   * ```
   */
  onMessage?: (message: ChatMessage) => void;
  /**
   * An abort signal that
   */
  signal?: AbortSignal;
  /**
   * Config provided to the plugin.
   */
  pluginConfig?: KVConfig;
  /**
   * Working directory for the generator.
   */
  workingDirectory?: string;
}
const llmGeneratorPredictionOptsSchema = z.object({
  onFirstToken: z.function().optional(),
  onPredictionFragment: z.function().optional(),
  onMessage: z.function().optional(),
  signal: z.instanceof(AbortSignal).optional(),
  pluginConfig: kvConfigSchema.optional(),
  workingDirectory: z.string().optional(),
});

/**
 * Options for the LLM generator's act method.
 *
 * @public
 * @deprecated Plugin support is still in development. Stay tuned for updates.
 */
export type LLMGeneratorActOpts = LLMActBaseOpts<GeneratorPredictionResult> & {
  /**
   * Config provided to the plugin.
   */
  pluginConfig?: KVConfig;
  /**
   * Working directory for the generator.
   */
  workingDirectory?: string;
};
export const llmGeneratorActOptsSchema = llmActBaseOptsSchema.extend({
  pluginConfig: kvConfigSchema.optional(),
  workingDirectory: z.string().optional(),
});

/**
 * Represents a handle for a generator that can act as a LLM.
 *
 * @public
 * @deprecated Plugin support is still in development. Stay tuned for updates.
 */
export class LLMGeneratorHandle {
  /**
   * Don't use this method directly, use {@link LLMNamespace#createGeneratorHandle} instead.
   *
   * @internal
   */
  public constructor(
    /** @internal */
    private readonly port: LLMPort,
    /** @internal */
    private readonly pluginIdentifier: string,
    /** @internal */
    private readonly validator: Validator,
    /** @internal */
    private readonly logger: SimpleLogger = new SimpleLogger(`LLMGeneratorHandle`),
  ) {}

  /**
   * Use the generator to produce a response based on the given history.
   */
  public respond(chat: ChatLike, opts: LLMGeneratorPredictionOpts = {}) {
    const stack = getCurrentStack(1);
    [chat, opts] = this.validator.validateMethodParamsOrThrow(
      "LLMGeneratorHandle",
      "respond",
      ["chat", "opts"],
      [chatHistoryLikeSchema, llmGeneratorPredictionOptsSchema],
      [chat, opts],
      stack,
    );

    const {
      onFirstToken,
      onPredictionFragment,
      onMessage,
      signal,
      pluginConfig = emptyKVConfig,
      workingDirectory,
    } = opts;

    let resolved = false;
    let firstTokenTriggered = false;

    const cancelEvent = new CancelEvent();

    if (signal !== undefined) {
      if (signal.aborted) {
        // If the signal is already aborted, we can immediately cancel the event.
        cancelEvent.cancel();
      } else {
        signal.addEventListener("abort", () => cancelEvent.cancel(), { once: true });
      }
    }

    const { ongoingPrediction, finished, failed, push } = OngoingGeneratorPrediction.create(
      this.pluginIdentifier,
      () => {
        cancelEvent.cancel();
      },
    );

    const channel = this.port.createChannel(
      "generateWithGenerator",
      {
        pluginIdentifier: this.pluginIdentifier,
        pluginConfigStack: singleLayerKVConfigStackOf("apiOverride", pluginConfig),
        tools: [],
        workingDirectoryPath: workingDirectory ?? null,
        history: accessMaybeMutableInternals(Chat.from(chat))._internalGetData(),
      },
      message => {
        const messageType = message.type;
        switch (messageType) {
          case "fragment": {
            if (!firstTokenTriggered) {
              firstTokenTriggered = true;
              safeCallCallback(this.logger, "onFirstToken", onFirstToken, []);
            }
            safeCallCallback(this.logger, "onPredictionFragment", onPredictionFragment, [
              message.fragment,
            ]);
            push(message.fragment);
            break;
          }
          case "success": {
            resolved = true;
            finished();
            break;
          }
        }
      },
      { stack },
    );
    channel.onError.subscribeOnce(error => {
      if (resolved) {
        return;
      }
      resolved = true;
      failed(error);
    });
    cancelEvent.subscribeOnce(() => {
      if (resolved) {
        return;
      }
      channel.send({ type: "cancel" });
    });
    ongoingPrediction.then(
      result => {
        // Call the onMessage callback with the result.
        safeCallCallback(this.logger, "onMessage", onMessage, [
          ChatMessage.create("assistant", result.content),
        ]);
      },
      () => {}, // Eat the error, as we don't want to throw it here.
    );
    return ongoingPrediction;
  }

  public async act(
    chat: ChatLike,
    tools: Array<Tool>,
    opts: LLMGeneratorActOpts = {},
  ): Promise<ActResult> {
    const startTime = performance.now();
    const stack = getCurrentStack(1);
    [chat, opts] = this.validator.validateMethodParamsOrThrow(
      "LLMGeneratorHandle",
      "act",
      ["chat", "opts"],
      [chatHistoryLikeSchema, llmGeneratorActOptsSchema],
      [chat, opts],
      stack,
    );

    const { pluginConfig = emptyKVConfig, workingDirectory = null, ...baseOpts } = opts;

    const toolDefinitions = tools.map(toolToLLMTool);

    return await internalAct<GeneratorPredictionResult, undefined>(
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
        handleToolCallGenerationEnd,
        handleToolCallGenerationFailed,
        handlePredictionEnd,
        handleError,
      }) => {
        // Use predict channel
        const channel = this.port.createChannel(
          "generateWithGenerator",
          {
            pluginIdentifier: this.pluginIdentifier,
            pluginConfigStack: singleLayerKVConfigStackOf("apiOverride", pluginConfig),
            tools: allowTools ? toolDefinitions : [],
            workingDirectoryPath: workingDirectory,
            history,
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
                handleToolCallGenerationStart();
                break;
              }
              case "toolCallGenerationEnd": {
                handleToolCallGenerationEnd(message.toolCallRequest);
                break;
              }
              case "toolCallGenerationFailed": {
                handleToolCallGenerationFailed();
                break;
              }
              case "success": {
                // Nothing to hand to the `makePredictionResult` function. Just pass in `undefined`.
                handlePredictionEnd(undefined);
                break;
              }
            }
          },
          { stack },
        );
        if (signal.aborted) {
          // If the signal is already aborted, we can immediately cancel the channel.
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
      ({ content, nonReasoningContent, reasoningContent }) =>
        new GeneratorPredictionResult(
          content,
          reasoningContent,
          nonReasoningContent,
          this.pluginIdentifier,
        ),
    );
  }
}
