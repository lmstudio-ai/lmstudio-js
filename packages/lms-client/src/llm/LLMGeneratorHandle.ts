import { getCurrentStack, SimpleLogger, type Validator } from "@lmstudio/lms-common";
import { type LLMPort } from "@lmstudio/lms-external-backend-interfaces";
import { emptyKVConfig, singleLayerKVConfigStackOf } from "@lmstudio/lms-kv-config";
import { kvConfigSchema, type KVConfig } from "@lmstudio/lms-shared-types";
import { z } from "zod";
import { chatHistoryLikeSchema, type ChatLike } from "../Chat.js";
import { internalAct, llmActBaseOptsSchema, type LLMActBaseOpts } from "./act.js";
import { type ActResult } from "./ActResult.js";
import { toolToLLMTool, type Tool } from "./tool.js";

/**
 * Options for the LLM generator's act method.
 *
 * @deprecated Plugin support is still in development. Stay tuned for updates.
 */
export type LLMGeneratorActOpts = LLMActBaseOpts<undefined> & {
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

    return await internalAct<undefined, undefined>(
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
        signal.addEventListener(
          "abort",
          () => {
            channel.send({ type: "cancel" });
          },
          { once: true },
        );
        channel.onError.subscribeOnce(handleError);
      },
      () => undefined,
    );
  }
}
