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
import { ChatMessage } from "../ChatHistory.js";
import { type ConfigSchematics } from "../customConfig.js";
import { type LMStudioClient } from "../LMStudioClient.js";
import { type Generator } from "./processing/Generator.js";
import { type Preprocessor } from "./processing/Preprocessor.js";
import {
  type GeneratorController,
  type PreprocessorController,
  ProcessingConnector,
  ProcessingController,
} from "./processing/ProcessingController.js";

/**
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
   */
  public async reindexPlugins() {
    const stack = getCurrentStack(1);
    await this.port.callRpc("reindexPlugins", undefined, { stack });
  }

  /**
   * Sets the preprocessor to be used by the plugin represented by this client.
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
  public async setConfigSchematics(configSchematics: ConfigSchematics<any>) {
    const stack = getCurrentStack(1);

    this.validator.validateMethodParamOrThrow(
      "llm",
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
          configSchematics as KVConfigSchematics<GlobalKVFieldValueTypeLibraryMap, any, any>
        ).serialize(),
      },
      { stack },
    );
  }
  public async initCompleted() {
    const stack = getCurrentStack(1);

    await this.port.callRpc("pluginInitCompleted", undefined, { stack });
  }
}
