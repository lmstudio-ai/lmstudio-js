import {
  accessMaybeMutableInternals,
  CancelEvent,
  getCurrentStack,
  makeTitledPrettyError,
  safeCallCallback,
  SimpleLogger,
  text,
  type Validator,
} from "@lmstudio/lms-common";
import { type PluginsPort } from "@lmstudio/lms-external-backend-interfaces";
import { emptyKVConfig } from "@lmstudio/lms-kv-config";
import {
  kvConfigSchema,
  type KVConfig,
  type LLMPredictionFragment,
  type PluginConfigSpecifier,
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
 * @experimental [EXP-GEN-PREDICT] Using generator plugins programmatically is still in development.
 * This may change in the future without warning.
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
 * @experimental [EXP-GEN-PREDICT] Using generator plugins programmatically is still in development.
 * This may change in the future without warning.
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

interface LLMGeneratorHandleAssociatedPredictionProcess {
  /**
   * Prediction process identifier.
   */
  pci: string;
  token: string;
}

/**
 * Represents a handle for a generator that can act as a LLM.
 *
 * @public
 * @experimental [EXP-GEN-PREDICT] Using generator plugins programmatically is still in development.
 * This may change in the future without warning.
 */
export class LLMGeneratorHandle {
  /**
   * Don't use this method directly, use {@link LLMNamespace#createGeneratorHandle} instead.
   *
   * @internal
   */
  public constructor(
    /** @internal */
    private readonly port: PluginsPort,
    /** @internal */
    private readonly pluginIdentifier: string,
    /** @internal */
    private readonly validator: Validator,
    /** @internal */
    private readonly associatedPredictionProcess: LLMGeneratorHandleAssociatedPredictionProcess | null,
    /** @internal */
    private readonly logger: SimpleLogger = new SimpleLogger(`LLMGeneratorHandle`),
  ) {}

  /**
   * The identifier of the plugin that this handle is associated with.
   */
  public readonly identifier = this.pluginIdentifier;

  private getPluginConfigSpecifier(
    userSuppliedPluginConfig: KVConfig | undefined,
    userSuppliedWorkingDirectory: string | undefined,
    stack?: string,
  ): PluginConfigSpecifier {
    if (this.associatedPredictionProcess === null) {
      // If there is no associated prediction process, we can use the user-supplied config directly.
      return {
        type: "direct",
        config: userSuppliedPluginConfig ?? emptyKVConfig,
        workingDirectoryPath: userSuppliedWorkingDirectory ?? undefined,
      };
    }
    // If there is an associated prediction process, we first need to make sure that the user has
    // not supplied a plugin config or working directory, as these are not allowed in this case.
    // (The plugin config/working directory of the prediction process will be used instead.)
    if (userSuppliedPluginConfig !== undefined) {
      throw makeTitledPrettyError(
        "Cannot use plugin config with prediction process",
        text`
          You cannot provide a plugin config to the generator handle when it is associated with a
          prediction process. The plugin config that was configured for the prediction process will
          be used instead.

          If you want to use a different plugin config, you will need to create a separate
          GeneratorHandle instead.
        `,
        stack,
      );
    }
    if (userSuppliedWorkingDirectory !== undefined) {
      throw makeTitledPrettyError(
        "Cannot use working directory with prediction process",
        text`
          You cannot provide a working directory to the generator handle when it is associated with
          a prediction process. The working directory that was configured for the prediction process
          will be used instead.

          If you want to use a different working directory, you will need to create a separate
          GeneratorHandle instead.
        `,
        stack,
      );
    }
    // If we reach here, we can safely return the plugin config specifier for the prediction
    // process.
    return {
      type: "predictionProcess",
      pci: this.associatedPredictionProcess.pci,
      token: this.associatedPredictionProcess.token,
    };
  }

  /**
   * Use the generator to produce a response based on the given history.
   */
  public respond(
    chat: ChatLike,
    opts: LLMGeneratorPredictionOpts = {},
  ): OngoingGeneratorPrediction {
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
      pluginConfig,
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
        pluginConfigSpecifier: this.getPluginConfigSpecifier(pluginConfig, workingDirectory, stack),
        tools: [],
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

    const { pluginConfig, workingDirectory, ...baseOpts } = opts;

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
        handleToolCallGenerationNameReceived,
        handleToolCallGenerationArgumentFragmentGenerated,
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
            pluginConfigSpecifier: this.getPluginConfigSpecifier(
              pluginConfig,
              workingDirectory,
              stack,
            ),
            tools: allowTools ? toolDefinitions : [],
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
                handleToolCallGenerationEnd(
                  message.toolCallRequest,
                  undefined, // No raw content for generators for now
                );
                break;
              }
              case "toolCallGenerationFailed": {
                handleToolCallGenerationFailed(
                  new Error("Tool call generation failed"), // Placeholder error for now
                  undefined, // No raw content for generators for now
                );
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
