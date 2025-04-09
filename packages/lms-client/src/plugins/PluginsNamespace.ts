import {
  getCurrentStack,
  type LoggerInterface,
  makePromise,
  SimpleLogger,
  Validator,
} from "@lmstudio/lms-common";
import { type PluginsPort } from "@lmstudio/lms-external-backend-interfaces";
import { type GlobalKVFieldValueTypeLibraryMap, KVConfigSchematics } from "@lmstudio/lms-kv-config";
import {
  type ChatMessageData,
  type PluginManifest,
  pluginManifestSchema,
  serializeError,
} from "@lmstudio/lms-shared-types";
import { z } from "zod";
import { ChatMessage } from "../Chat.js";
import { type ConfigSchematics } from "../customConfig.js";
import { type Tool, type ToolCallContext, toolToLLMTool } from "../llm/tool.js";
import { type LMStudioClient } from "../LMStudioClient.js";
import { type Generator } from "./processing/Generator.js";
import { type Preprocessor } from "./processing/Preprocessor.js";
import {
  type GeneratorController,
  type PreprocessorController,
  ProcessingConnector,
  ProcessingController,
} from "./processing/ProcessingController.js";
import { type ToolsProvider } from "./processing/ToolsProvider.js";
import { ToolsProviderController } from "./processing/ToolsProviderController.js";

/**
 * Options to use with {@link PluginsNamespace#registerDevelopmentPlugin}.
 *
 * @public
 */
export interface RegisterDevelopmentPluginOpts {
  manifest: PluginManifest;
}
const registerDevelopmentPluginOptsSchema = z.object({
  manifest: pluginManifestSchema,
});

interface RegisterDevelopmentPluginResultBase {
  clientIdentifier: string;
  clientPasskey: string;
}

/**
 * Result of {@link PluginsNamespace#registerDevelopmentPlugin}.
 *
 * @public
 */
export interface RegisterDevelopmentPluginResult {
  clientIdentifier: string;
  clientPasskey: string;
  unregister: () => Promise<void>;
}

/**
 * @public
 *
 * The namespace for file-related operations. Currently no public-facing methods.
 */
export class PluginsNamespace {
  /** @internal */
  private readonly logger: SimpleLogger;
  /** @internal */
  public constructor(
    /** @internal */
    private readonly port: PluginsPort,
    private readonly client: LMStudioClient,
    private readonly validator: Validator,
    parentLogger: LoggerInterface,
    private readonly rootLogger: LoggerInterface,
  ) {
    this.logger = new SimpleLogger("Plugins", parentLogger);
  }

  /**
   * @deprecated Plugin support is still in development. Stay tuned for updates.
   */
  public async registerDevelopmentPlugin(
    opts: RegisterDevelopmentPluginOpts,
  ): Promise<RegisterDevelopmentPluginResult> {
    const stack = getCurrentStack(1);

    this.validator.validateMethodParamOrThrow(
      "plugins",
      "registerDevelopmentPlugin",
      "opts",
      registerDevelopmentPluginOptsSchema,
      opts,
      stack,
    );

    const { promise, resolve } = makePromise<RegisterDevelopmentPluginResultBase>();

    const channel = this.port.createChannel(
      "registerDevelopmentPlugin",
      opts,
      message => {
        if (message.type === "ready") {
          resolve({
            clientIdentifier: message.clientIdentifier,
            clientPasskey: message.clientPasskey,
          });
        }
      },
      { stack },
    );

    const unregister = async () => {
      channel.send({ type: "end" });
      const { promise, resolve } = makePromise<void>();
      channel.onClose.subscribeOnce(resolve);
      await promise;
    };

    const base = await promise;

    return {
      ...base,
      unregister,
    };
  }

  /**
   * Requests LM Studio to reindex all the plugins.
   *
   * CAVEAT: Currently, we do not wait for the reindex to complete before returning. In the future,
   * we will change this behavior and only return after the reindex is completed.
   *
   * @deprecated Plugin support is still in development. Stay tuned for updates.
   */
  public async reindexPlugins() {
    const stack = getCurrentStack(1);
    await this.port.callRpc("reindexPlugins", undefined, { stack });
  }

  /**
   * Sets the preprocessor to be used by the plugin represented by this client.
   *
   * @deprecated Plugin support is still in development. Stay tuned for updates.
   */
  public setPreprocessor(preprocessor: Preprocessor) {
    const stack = getCurrentStack(1);

    this.validator.validateMethodParamOrThrow(
      "plugins",
      "registerPreprocessor",
      "preprocessor",
      z.function(),
      preprocessor,
      stack,
    );

    const logger = new SimpleLogger(`Preprocessor`, this.rootLogger);
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
      "setPreprocessor",
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
            const controller: PreprocessorController = new ProcessingController(
              this.client,
              connector,
              message.config,
              message.pluginConfig,
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
            preprocessor(controller, input.asMutableCopy())
              .then(result => {
                taskLogger.info(`Preprocess request completed.`);
                const parsedReturned = z
                  .union([z.string(), z.custom<ChatMessage>(v => v instanceof ChatMessage)])
                  .safeParse(result);
                if (!parsedReturned.success) {
                  throw new Error(
                    "Preprocessor returned an invalid value:" +
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
   * Sets the preprocessor to be used by the plugin represented by this client.
   *
   * @deprecated Plugin support is still in development. Stay tuned for updates.
   */
  public setGenerator(generator: Generator) {
    const stack = getCurrentStack(1);

    this.validator.validateMethodParamOrThrow(
      "plugins",
      "setGenerator",
      "generator",
      z.function(),
      generator,
      stack,
    );

    const logger = new SimpleLogger(`   Generator`, this.rootLogger);
    logger.info("Register with LM Studio");

    interface OngoingGenerateTask {
      /**
       * Function to cancel the generate task
       */
      cancel: () => void;
      /**
       * Logger associated with this task.
       */
      taskLogger: SimpleLogger;
    }

    const tasks = new Map<string, OngoingGenerateTask>();
    const channel = this.port.createChannel(
      "setGenerator",
      undefined,
      message => {
        switch (message.type) {
          case "generate": {
            const taskLogger = new SimpleLogger(
              `Request (${message.taskId.substring(0, 6)})`,
              logger,
            );
            taskLogger.info(`New generate request received.`);
            const abortController = new AbortController();
            const connector = new ProcessingConnector(
              this.port,
              abortController.signal,
              message.pci,
              message.token,
              taskLogger,
            );
            const controller: GeneratorController = new ProcessingController(
              this.client,
              connector,
              message.config,
              message.pluginConfig,
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
            generator(controller)
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
   * @deprecated Plugin support is still in development. Stay tuned for updates.
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
   * @deprecated Plugin support is still in development. Stay tuned for updates.
   */
  public async setToolsProvider(toolsProvider: ToolsProvider) {
    const stack = getCurrentStack(1);

    this.validator.validateMethodParamOrThrow(
      "plugins",
      "setToolsProvider",
      "toolsProvider",
      z.function(),
      toolsProvider,
      stack,
    );

    const logger = new SimpleLogger(`Tools Prov.`, this.rootLogger);
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
          const openSession: OpenSessions = {
            tools: null,
            ongoingToolCalls: new Map(),
            discarded: false,
          };
          openSessions.set(sessionId, openSession);
          const controller = new ToolsProviderController(this.client, message.pluginConfig);
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
   * @deprecated Plugin support is still in development. Stay tuned for updates.
   */
  public async initCompleted() {
    const stack = getCurrentStack(1);

    await this.port.callRpc("pluginInitCompleted", undefined, { stack });
  }
}
