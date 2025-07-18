import {
  getCurrentStack,
  type LoggerInterface,
  SimpleLogger,
  text,
  Validator,
} from "@lmstudio/lms-common";
import { type InferClientChannelType } from "@lmstudio/lms-communication";
import {
  type PluginsBackendInterface,
  type PluginsPort,
} from "@lmstudio/lms-external-backend-interfaces";
import { type GlobalKVFieldValueTypeLibraryMap, KVConfigSchematics } from "@lmstudio/lms-kv-config";
import {
  type ChatMessageData,
  type LLMPredictionFragmentInputOpts,
  serializeError,
  type ToolCallRequest,
} from "@lmstudio/lms-shared-types";
import { z } from "zod";
import { Chat, ChatMessage } from "../Chat.js";
import { type ConfigSchematics } from "../customConfig.js";
import { type Tool, type ToolCallContext, toolToLLMTool } from "../llm/tool.js";
import { type LMStudioClient } from "../LMStudioClient.js";
import { type Generator, generatorSchema } from "./processing/Generator.js";
import { type GeneratorConnector, GeneratorController } from "./processing/GeneratorController.js";
import { type PredictionLoopHandler } from "./processing/PredictionLoopHandler.js";
import {
  type PredictionLoopHandlerController,
  ProcessingConnector,
  ProcessingController,
  type PromptPreprocessorController,
} from "./processing/ProcessingController.js";
import { type PromptPreprocessor } from "./processing/PromptPreprocessor.js";
import { type ToolsProvider } from "./processing/ToolsProvider.js";
import { ToolsProviderController } from "./processing/ToolsProviderController.js";

class GeneratorConnectorImpl implements GeneratorConnector {
  public constructor(
    private readonly channel: InferClientChannelType<PluginsBackendInterface, "setGenerator">,
    private readonly taskId: string,
  ) {}

  public fragmentGenerated(content: string, opts: LLMPredictionFragmentInputOpts): void {
    this.channel.send({
      type: "fragmentGenerated",
      taskId: this.taskId,
      content,
      opts: opts,
    });
  }

  public toolCallGenerationStarted(toolCallId: string | undefined): void {
    this.channel.send({
      type: "toolCallGenerationStarted",
      taskId: this.taskId,
      toolCallId,
    });
  }

  public toolCallGenerationNameReceived(toolName: string): void {
    this.channel.send({
      type: "toolCallGenerationNameReceived",
      taskId: this.taskId,
      toolName,
    });
  }

  public toolCallGenerationArgumentFragmentGenerated(content: string): void {
    this.channel.send({
      type: "toolCallGenerationArgumentFragmentGenerated",
      taskId: this.taskId,
      content,
    });
  }

  public toolCallGenerationEnded(toolCallRequest: ToolCallRequest): void {
    this.channel.send({
      type: "toolCallGenerationEnded",
      taskId: this.taskId,
      toolCallRequest,
    });
  }

  public toolCallGenerationFailed(error: Error): void {
    this.channel.send({
      type: "toolCallGenerationFailed",
      taskId: this.taskId,
      error: serializeError(error),
    });
  }
}

/**
 * @deprecated This class is used internally by a plugin to register hooks. Do not use directly.
 * @public
 */
export class PluginSelfRegistrationHost {
  public constructor(
    private readonly port: PluginsPort,
    private readonly client: LMStudioClient,
    private readonly rootLogger: LoggerInterface,
    private readonly validator: Validator,
  ) {}

  /**
   * Sets the promptPreprocessor to be used by the plugin represented by this client.
   *
   * @experimental [EXP-PLUGIN-CORE] Plugin support is still in development. This may change in the
   * future without warning.
   */
  public setPromptPreprocessor(promptPreprocessor: PromptPreprocessor) {
    const stack = getCurrentStack(1);

    this.validator.validateMethodParamOrThrow(
      "plugins",
      "registerPromptPreprocessor",
      "promptPreprocessor",
      z.function(),
      promptPreprocessor,
      stack,
    );

    const logger = new SimpleLogger(`PromptPreprocessor`, this.rootLogger);
    logger.info("Register with LM Studio");

    interface OngoingPreprocessTask {
      /**
       * Function to cancel the preprocess task
       */
      cancel: () => void;
      /**
       * Logger associated with this task.
       */
      taskLogger: SimpleLogger;
    }

    const tasks = new Map<string, OngoingPreprocessTask>();
    const channel = this.port.createChannel(
      "setPromptPreprocessor",
      undefined,
      message => {
        switch (message.type) {
          case "preprocess": {
            const taskLogger = new SimpleLogger(
              `Request (${message.taskId.substring(0, 6)})`,
              logger,
            );
            taskLogger.info(`New preprocess request received.`);
            const abortController = new AbortController();
            const connector = new ProcessingConnector(
              this.port,
              abortController.signal,
              message.pci,
              message.token,
              taskLogger,
            );
            const input = ChatMessage.createRaw(message.input, /* mutable */ false);
            const controller: PromptPreprocessorController = new ProcessingController(
              this.client,
              message.pluginConfig,
              message.globalPluginConfig,
              message.workingDirectoryPath,
              message.enabledPluginInfos,
              connector,
              message.config,
              /* shouldIncludeInputInHistory */ false,
            );
            tasks.set(message.taskId, {
              cancel: () => {
                abortController.abort();
              },
              taskLogger,
            });
            // We know the input from the channel is immutable, so we can safely pass false as the
            // second argument.
            promptPreprocessor(controller, input.asMutableCopy())
              .then(result => {
                taskLogger.info(`Preprocess request completed.`);
                const parsedReturned = z
                  .union([z.string(), z.custom<ChatMessage>(v => v instanceof ChatMessage)])
                  .safeParse(result);
                if (!parsedReturned.success) {
                  throw new Error(
                    "PromptPreprocessor returned an invalid value:" +
                      Validator.prettyPrintZod("result", parsedReturned.error),
                  );
                }
                const returned = parsedReturned.data;
                let processed: ChatMessageData;
                if (typeof returned === "string") {
                  const messageCopy = input.asMutableCopy();
                  messageCopy.replaceText(returned);
                  processed = messageCopy.getRaw();
                } else {
                  processed = returned.getRaw();
                }

                channel.send({
                  type: "complete",
                  taskId: message.taskId,
                  processed,
                });
              })
              .catch(error => {
                if (error.name === "AbortError") {
                  logger.info(`Request successfully aborted.`);
                  channel.send({
                    type: "aborted",
                    taskId: message.taskId,
                  });
                  return;
                }
                logger.warn(`Preprocessing failed.`, error);
                channel.send({
                  type: "error",
                  taskId: message.taskId,
                  error: serializeError(error),
                });
              })
              .finally(() => {
                tasks.delete(message.taskId);
              });
            break;
          }
          case "abort": {
            const task = tasks.get(message.taskId);
            if (task !== undefined) {
              task.taskLogger.info(`Received abort request.`);
              task.cancel();
              tasks.delete(message.taskId);
            }
            break;
          }
        }
      },
      { stack },
    );
  }

  /**
   * Sets the prediction loop handler to be used by the plugin represented by this client.
   *
   * @deprecated [DEP-PLUGIN-PREDICTION-LOOP-HANDLER] Prediction loop handler support is still in
   * development. Stay tuned for updates.
   */
  public setPredictionLoopHandler(predictionLoopHandler: PredictionLoopHandler) {
    const stack = getCurrentStack(1);

    this.validator.validateMethodParamOrThrow(
      "plugins",
      "setPredictionLoopHandler",
      "predictionLoopHandler",
      z.function(),
      predictionLoopHandler,
      stack,
    );

    const logger = new SimpleLogger(`   PredictionLoopHandler`, this.rootLogger);
    logger.info("Register with LM Studio");

    interface OngoingPredictionLoopHandlingTask {
      /**
       * Function to cancel the generate task
       */
      cancel: () => void;
      /**
       * Logger associated with this task.
       */
      taskLogger: SimpleLogger;
    }

    const tasks = new Map<string, OngoingPredictionLoopHandlingTask>();
    const channel = this.port.createChannel(
      "setPredictionLoopHandler",
      undefined,
      message => {
        switch (message.type) {
          case "handlePredictionLoop": {
            const taskLogger = new SimpleLogger(
              `Request (${message.taskId.substring(0, 6)})`,
              logger,
            );
            taskLogger.info(`New prediction loop handling request received.`);
            const abortController = new AbortController();
            const connector = new ProcessingConnector(
              this.port,
              abortController.signal,
              message.pci,
              message.token,
              taskLogger,
            );
            const controller: PredictionLoopHandlerController = new ProcessingController(
              this.client,
              message.pluginConfig,
              message.globalPluginConfig,
              message.workingDirectoryPath,
              message.enabledPluginInfos,
              connector,
              message.config,
              /* shouldIncludeInputInHistory */ true,
            );
            tasks.set(message.taskId, {
              cancel: () => {
                abortController.abort();
              },
              taskLogger,
            });
            // We know the input from the channel is immutable, so we can safely pass false as the
            // second argument.
            predictionLoopHandler(controller)
              .then(() => {
                channel.send({
                  type: "complete",
                  taskId: message.taskId,
                });
              })
              .catch(error => {
                if (error.name === "AbortError") {
                  logger.info(`Request successfully aborted.`);
                  channel.send({
                    type: "aborted",
                    taskId: message.taskId,
                  });
                  return;
                }
                logger.warn(`Generation failed.`, error);
                channel.send({
                  type: "error",
                  taskId: message.taskId,
                  error: serializeError(error),
                });
              })
              .finally(() => {
                tasks.delete(message.taskId);
              });
            break;
          }
          case "abort": {
            const task = tasks.get(message.taskId);
            if (task !== undefined) {
              task.taskLogger.info(`Received abort request.`);
              task.cancel();
              tasks.delete(message.taskId);
            }
            break;
          }
        }
      },
      { stack },
    );
  }

  /**
   * @experimental [EXP-PLUGIN-CORE] Plugin support is still in development. This may change in the
   * future without warning.
   */
  public async setConfigSchematics(configSchematics: ConfigSchematics<any>) {
    const stack = getCurrentStack(1);

    this.validator.validateMethodParamOrThrow(
      "plugins",
      "setConfigSchematics",
      "configSchematics",
      z.instanceof(KVConfigSchematics),
      configSchematics,
      stack,
    );

    await this.port.callRpc(
      "setConfigSchematics",
      {
        schematics: (
          configSchematics as KVConfigSchematics<GlobalKVFieldValueTypeLibraryMap, any>
        ).serialize(),
      },
      { stack },
    );
  }

  /**
   * @experimental [EXP-PLUGIN-CORE] Plugin support is still in development. This may change in the
   * future without warning.
   */
  public async setGlobalConfigSchematics(globalConfigSchematics: ConfigSchematics<any>) {
    const stack = getCurrentStack(1);

    this.validator.validateMethodParamOrThrow(
      "plugins",
      "setGlobalConfigSchematics",
      "globalConfigSchematics",
      z.instanceof(KVConfigSchematics),
      globalConfigSchematics,
      stack,
    );

    await this.port.callRpc(
      "setGlobalConfigSchematics",
      {
        schematics: (
          globalConfigSchematics as KVConfigSchematics<GlobalKVFieldValueTypeLibraryMap, any>
        ).serialize(),
      },
      { stack },
    );
  }

  /**
   * @experimental [EXP-PLUGIN-CORE] Plugin support is still in development. This may change in the
   * future without warning.
   */
  public setToolsProvider(toolsProvider: ToolsProvider) {
    const stack = getCurrentStack(1);

    this.validator.validateMethodParamOrThrow(
      "plugins",
      "setToolsProvider",
      "toolsProvider",
      z.function(),
      toolsProvider,
      stack,
    );

    const logger = new SimpleLogger(`Tools Prvdr.`, this.rootLogger);
    logger.info("Register with LM Studio");

    interface OngoingToolCall {
      settled: boolean;
      abortController: AbortController;
    }

    interface OpenSessions {
      /**
       * Map from tool name to the tool. Null if not yet initialized.
       */
      tools: Map<string, Tool> | null;
      /**
       * Map from callId to ongoing tool call.
       */
      ongoingToolCalls: Map<string, OngoingToolCall>;
      /**
       * Starts with false. Set to true when the session is discarded.
       */
      discarded: boolean;
      /**
       * Abort controller for the session. Used to abort session initialization.
       */
      abortController: AbortController;
    }

    /**
     * Map from sessionId to the open session.
     */
    const openSessions = new Map<string, OpenSessions>();

    const channel = this.port.createChannel("setToolsProvider", undefined, message => {
      const messageType = message.type;
      switch (messageType) {
        case "initSession": {
          const sessionId = message.sessionId;
          const sessionAbortController = new AbortController();
          const openSession: OpenSessions = {
            tools: null,
            ongoingToolCalls: new Map(),
            discarded: false,
            abortController: sessionAbortController,
          };
          openSessions.set(sessionId, openSession);
          const controller = new ToolsProviderController(
            this.client,
            sessionAbortController.signal,
            message.pluginConfig,
            message.globalPluginConfig,
            message.workingDirectoryPath,
          );
          toolsProvider(controller).then(
            tools => {
              const llmTools = tools.map(toolToLLMTool);
              if (openSession.discarded) {
                // By the time initialization is done, the session was already discarded. Don't
                // do anything.
                return;
              }
              channel.send({
                type: "sessionInitialized",
                sessionId,
                toolDefinitions: llmTools,
              });
              openSession.tools = new Map<string, Tool>(tools.map(tool => [tool.name, tool]));
            },
            error => {
              if (openSession.discarded) {
                // If the session was already discarded, don't do anything.
                return;
              }
              channel.send({
                type: "sessionInitializationFailed",
                sessionId,
                error: serializeError(error),
              });
              openSession.discarded = true;
              openSessions.delete(sessionId);
            },
          );
          break;
        }
        case "discardSession": {
          const sessionId = message.sessionId;
          const openSession = openSessions.get(sessionId);
          if (openSession === undefined) {
            // Session was already discarded or doesn't exist. Ignore.
            return;
          }
          openSession.discarded = true;
          openSession.abortController.abort();
          openSessions.delete(sessionId);
          break;
        }
        case "callTool": {
          const sessionId = message.sessionId;
          const openSession = openSessions.get(sessionId);
          if (openSession === undefined) {
            // Session was already discarded or doesn't exist. Ignore.
            return;
          }
          if (openSession.tools === null) {
            throw new Error("Tool called before initialization completed. This is unexpected.");
          }
          const tool = openSession.tools.get(message.toolName);
          if (tool === undefined) {
            throw new Error(`Tool ${message.toolName} not found.`);
          }
          const callId = message.callId;
          const ongoingToolCall: OngoingToolCall = {
            settled: false,
            abortController: new AbortController(),
          };
          openSession.ongoingToolCalls.set(callId, ongoingToolCall);
          const logger = new SimpleLogger(`Tool (${message.toolName})`, this.rootLogger);

          const toolCallContext: ToolCallContext = {
            status(text: string) {
              channel.send({
                type: "toolCallStatus",
                sessionId,
                callId,
                statusText: text,
              });
            },
            warn(text: string) {
              channel.send({
                type: "toolCallWarn",
                sessionId,
                callId,
                warnText: text,
              });
            },
            signal: ongoingToolCall.abortController.signal,
            // Call ID is used to match up life cycle events of the same tool call. In this case,
            // each call does not have different parts, thus call ID is useless. We can just use 0.
            // If the user wants a "unique" ID, they can just have variable that goes up by one
            // each time the function is called.
            callId: 0,
          };

          (async () => {
            return await tool.implementation(message.parameters, toolCallContext);
          })().then(
            result => {
              if (openSession.discarded) {
                // Session was already discarded. Ignore.
                return;
              }
              if (ongoingToolCall.settled) {
                // Tool call was already settled. Ignore.
                return;
              }
              if (ongoingToolCall.abortController.signal.aborted) {
                // Tool call was aborted. Ignore.
                return;
              }
              if (result === undefined) {
                result = "undefined"; // Default to "undefined" if no result is provided.
                channel.send({
                  type: "toolCallWarn",
                  sessionId,
                  callId,
                  warnText: text`
                    Tool call returned undefined. This is not expected as the model always expects
                    a result. If you don't want to return anything, you can just return a string
                    reporting that the tool call was successful. For example: "operation
                    successful." In this case, we will give the model string "${result}".
                  `,
                });
              }
              // Try to see if the result is JSON serializable. If it is not, we will print a
              // warning.
              try {
                JSON.stringify(result);
              } catch (error) {
                result = text`
                  Error: Tool call completed but returned a value that cannot be serialized to JSON
                `;
                channel.send({
                  type: "toolCallWarn",
                  sessionId,
                  callId,
                  warnText: text`
                    Tool call succeeded, but returned a value that is not JSON serializable. In
                    order to provide the result to the model, return values of tools must be JSON
                    serializable. In this case, we will give the model string "${result}".
                  `,
                });
              }
              channel.send({
                type: "toolCallComplete",
                sessionId,
                callId,
                result,
              });
              ongoingToolCall.settled = true;
              openSession.ongoingToolCalls.delete(callId);
            },
            error => {
              if (openSession.discarded) {
                // Session was already discarded. Ignore.
                return;
              }
              if (ongoingToolCall.settled) {
                // Tool call was already settled. Ignore.
                return;
              }
              if (ongoingToolCall.abortController.signal.aborted) {
                // Tool call was aborted. Ignore.
                return;
              }
              channel.send({
                type: "toolCallError",
                sessionId,
                callId,
                error: serializeError(error),
              });
              ongoingToolCall.settled = true;
              openSession.ongoingToolCalls.delete(callId);
            },
          );
          break;
        }
        case "abortToolCall": {
          const sessionId = message.sessionId;
          const callId = message.callId;
          const openSession = openSessions.get(sessionId);
          if (openSession === undefined) {
            // Session was already discarded or doesn't exist. Ignore.
            return;
          }
          const ongoingToolCall = openSession.ongoingToolCalls.get(callId);
          if (ongoingToolCall === undefined) {
            // Tool call was already completed or doesn't exist. Ignore.
            return;
          }
          ongoingToolCall.settled = true;
          ongoingToolCall.abortController.abort();
          openSession.ongoingToolCalls.delete(callId);
          break;
        }
        default: {
          const exhaustiveCheck: never = messageType;
          throw new Error(`Unexpected message type: ${exhaustiveCheck}`);
        }
      }
    });
  }

  /**
   * Sets the generator to be used by the plugin represented by this client.
   *
   * @experimental [EXP-PLUGIN-CORE] Plugin support is still in development. This may change in the
   * future without warning.
   */
  public setGenerator(generator: Generator) {
    const stack = getCurrentStack(1);

    this.validator.validateMethodParamOrThrow(
      "plugins",
      "setGenerator",
      "generator",
      generatorSchema,
      generator,
      stack,
    );

    const logger = new SimpleLogger(`Generator`, this.rootLogger);
    logger.info("Register with LM Studio");

    interface OngoingGenerationTask {
      /**
       * Function to cancel the generation task
       */
      cancel: () => void;
      /**
       * Logger associated with this task.
       */
      taskLogger: SimpleLogger;
    }

    const tasks = new Map<string, OngoingGenerationTask>();
    const channel = this.port.createChannel("setGenerator", undefined, message => {
      const messageType = message.type;
      switch (messageType) {
        case "generate": {
          const taskLogger = new SimpleLogger(
            `Request (${message.taskId.substring(0, 6)})`,
            logger,
          );
          taskLogger.info(`New generate request received.`);
          const abortController = new AbortController();
          const connector = new GeneratorConnectorImpl(channel, message.taskId);
          const controller = new GeneratorController(
            this.client,
            message.pluginConfig,
            message.globalPluginConfig,
            message.workingDirectoryPath,
            abortController.signal,
            message.toolDefinitions,
            connector,
            this.validator,
          );
          tasks.set(message.taskId, {
            cancel: () => {
              abortController.abort();
            },
            taskLogger,
          });
          const history = Chat.createRaw(message.input, false);

          generator(controller, history)
            .then(
              result => {
                if (result !== undefined) {
                  taskLogger.warnText`
                    The generator has returned a value. This it not expected. You should report
                    generated content using method on the controller. The returned value will be
                    ignored.
                  `;
                }
                channel.send({
                  type: "complete",
                  taskId: message.taskId,
                });
              },
              error => {
                if (error.name === "AbortError") {
                  taskLogger.info(`Request successfully aborted.`);
                  channel.send({
                    type: "aborted",
                    taskId: message.taskId,
                  });
                } else {
                  channel.send({
                    type: "error",
                    taskId: message.taskId,
                    error: serializeError(error),
                  });
                  taskLogger.warn(`Generation failed.`, error);
                }
              },
            )
            .finally(() => {
              tasks.delete(message.taskId);
            });

          break;
        }
        case "abort": {
          const task = tasks.get(message.taskId);
          if (task !== undefined) {
            task.taskLogger.info(`Received abort request.`);
            task.cancel();
            tasks.delete(message.taskId);
          }
          break;
        }
        default: {
          const exhaustiveCheck: never = messageType;
          throw new Error(`Unexpected message type: ${exhaustiveCheck}`);
        }
      }
    });
  }

  /**
   * @experimental [EXP-PLUGIN-CORE] Plugin support is still in development. This may change in the
   * future without warning.
   */
  public async initCompleted() {
    const stack = getCurrentStack(1);

    await this.port.callRpc("pluginInitCompleted", undefined, { stack });
  }
}
