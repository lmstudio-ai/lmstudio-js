import {
  getCurrentStack,
  makePrettyError,
  makePromise,
  safeCallCallback,
  SimpleLogger,
  text,
  type Validator,
} from "@lmstudio/lms-common";
import { type BaseModelPort } from "@lmstudio/lms-external-backend-interfaces";
import { singleLayerKVConfigStackOf } from "@lmstudio/lms-kv-config";
import {
  logLevelSchema,
  modelQuerySchema,
  reasonableKeyStringSchema,
  type KVConfig,
  type LogLevel,
  type ModelDomainType,
  type ModelInfoBase,
  type ModelInstanceInfoBase,
  type ModelQuery,
  type ModelSpecifier,
} from "@lmstudio/lms-shared-types";
import { z, type ZodSchema } from "zod";
import { type EmbeddingDynamicHandle } from "../embedding/EmbeddingDynamicHandle.js";
import { type LLMDynamicHandle } from "../llm/LLMDynamicHandle.js";
import { type LMStudioClient } from "../LMStudioClient.js";
import { type DynamicHandle } from "./DynamicHandle.js";

/** @public */
export interface BaseLoadModelOpts<TLoadModelConfig> {
  /**
   * The identifier to use for the loaded model.
   *
   * By default, the identifier is the same as the path (1st parameter). If the identifier already
   * exists, a number will be attached. This option allows you to specify the identifier to use.
   *
   * However, when the identifier is specified and it is in use, an error will be thrown. If the
   * call is successful, it is guaranteed that the loaded model will have the specified identifier.
   */
  identifier?: string;

  /**
   * The configuration to use when loading the model.
   */
  config?: TLoadModelConfig;

  /**
   * An `AbortSignal` to cancel the model loading. This is useful if you wish to add a functionality
   * to cancel the model loading.
   *
   * Example usage:
   *
   * ```typescript
   * const ac = new AbortController();
   * const model = await client.llm.load({
   *   model: "lmstudio-community/Meta-Llama-3-8B-Instruct-GGUF",
   *   signal: ac.signal,
   * });
   *
   * // Later, to cancel the model loading
   * ac.abort();
   * ```
   *
   * AbortController/AbortSignal is the standard method for cancelling an asynchronous operation in
   * JavaScript. For more information, visit
   * https://developer.mozilla.org/en-US/docs/Web/API/AbortController
   */
  signal?: AbortSignal;

  /**
   * Idle time to live (TTL) in seconds. If specified, when the model is not used for the specified number
   * of seconds, the model will be automatically unloaded. If the model is used before the TTL, the
   * timer will be reset.
   */
  ttl?: number;

  /**
   * Controls the logging of model loading progress.
   *
   * - If set to `true`, logs progress at the "info" level.
   * - If set to `false`, no logs are emitted. This is the default.
   * - If a specific logging level is desired, it can be provided as a string. Acceptable values are
   *   "debug", "info", "warn", and "error".
   *
   * Logs are directed to the logger specified during the `LMStudioClient` construction.
   *
   * Progress logs will be disabled if an `onProgress` callback is provided.
   *
   * Default value is "info", which logs progress at the "info" level.
   */
  verbose?: boolean | LogLevel;

  /**
   * A function that is called with the progress of the model loading. The function is called with a
   * number between 0 and 1, inclusive, representing the progress of the model loading.
   *
   * If an `onProgress` callback is provided, verbose progress logs will be disabled.
   */
  onProgress?: (progress: number) => void;
}
function makeLoadModelOptsSchema<TLoadModelConfig>(
  loadModelConfigSchema: ZodSchema<TLoadModelConfig>,
): ZodSchema<BaseLoadModelOpts<TLoadModelConfig>> {
  return z.object({
    identifier: z.string().optional(),
    config: loadModelConfigSchema.optional(),
    signal: z.instanceof(AbortSignal).optional(),
    ttl: z.number().optional(),
    verbose: z.union([z.boolean(), logLevelSchema]).optional(),
    onProgress: z.function().optional(),
  });
}

/**
 * Abstract namespace for namespaces that deal with models.
 *
 * @public
 */
export abstract class ModelNamespace<
  /** @internal */
  TClientPort extends BaseModelPort<TModelInstanceInfo, TModelInfo>,
  TLoadModelConfig,
  TModelInstanceInfo extends ModelInstanceInfoBase,
  TModelInfo extends ModelInfoBase,
  TDynamicHandle extends DynamicHandle<
    // prettier-ignore
    /** @internal */ TClientPort,
    TModelInstanceInfo
  >,
  TSpecificModel,
> {
  /**
   * The actual namespace name.
   *
   * @internal
   */
  protected abstract readonly namespace: ModelDomainType;
  /** @internal */
  protected abstract readonly defaultLoadConfig: TLoadModelConfig;
  /**
   * The schema for parsing load model config.
   *
   * @internal
   */
  protected abstract readonly loadModelConfigSchema: ZodSchema<TLoadModelConfig>;
  /**
   * Method for converting the domain-specific load config to KVConfig.
   *
   * @internal
   */
  protected abstract loadConfigToKVConfig(config: TLoadModelConfig): KVConfig;
  /** @internal */
  protected abstract createDomainSpecificModel(
    port: TClientPort,
    info: TModelInstanceInfo,
    validator: Validator,
    logger: SimpleLogger,
  ): TSpecificModel;
  /** @internal */
  protected abstract createDomainDynamicHandle(
    port: TClientPort,
    specifier: ModelSpecifier,
    validator: Validator,
    logger: SimpleLogger,
  ): TDynamicHandle;
  /** @internal */
  private loadModelOptsSchema: ZodSchema<BaseLoadModelOpts<TLoadModelConfig>> | null = null;
  /** @internal */
  private getLoadModelOptsSchema() {
    if (this.loadModelOptsSchema === null) {
      this.loadModelOptsSchema = makeLoadModelOptsSchema(this.loadModelConfigSchema);
    }
    return this.loadModelOptsSchema;
  }

  /** @internal */
  public constructor(
    /** @internal */
    protected readonly client: LMStudioClient,
    /** @internal */
    protected readonly port: TClientPort,
    /** @internal */
    protected readonly logger: SimpleLogger,
    /** @internal */
    protected readonly validator: Validator,
  ) {}
  /**
   * Load a model for inferencing. The first parameter is the model key. The second parameter is an
   * optional object with additional options.
   *
   * To find out what models are available, you can use the `lms ls` command, or programmatically
   * use the `client.system.listDownloadedModels` method.
   *
   * Here are some examples:
   *
   * Loading Llama 3.2:
   *
   * ```typescript
   * const model = await client.llm.load("llama-3.2-3b-instruct");
   * ```
   *
   * Once loaded, see {@link LLMDynamicHandle} or {@link EmbeddingDynamicHandle} for how to use the
   * model for inferencing or other things you can do with the model.
   *
   * @param modelKey - The path of the model to load.
   * @param opts - Options for loading the model.
   * @returns A promise that resolves to the model that can be used for inferencing
   */
  public async load(
    modelKey: string,
    opts: BaseLoadModelOpts<TLoadModelConfig> = {},
  ): Promise<TSpecificModel> {
    const stack = getCurrentStack(1);
    [modelKey, opts] = this.validator.validateMethodParamsOrThrow(
      `client.${this.namespace}`,
      "load",
      ["modelKey", "opts"],
      [reasonableKeyStringSchema, this.getLoadModelOptsSchema()],
      [modelKey, opts],
      stack,
    );
    const { identifier, signal, verbose = "info", config, onProgress } = opts;
    let lastVerboseCallTime = 0;

    const { promise, resolve, reject } = makePromise<TSpecificModel>();
    const verboseLevel = typeof verbose === "boolean" ? "info" : verbose;

    const startTime = Date.now();
    if (verbose) {
      this.logger.logAtLevel(
        verboseLevel,
        text`
          Verbose logging is enabled. To hide progress logs, set the "verbose" option to false in
          client.llm.load.
        `,
      );
    }

    let fullPath: string = modelKey;

    const channel = this.port.createChannel(
      "loadModel",
      {
        modelKey,
        identifier,
        ttlMs: opts.ttl === undefined ? undefined : opts.ttl * 1000,
        loadConfigStack: singleLayerKVConfigStackOf(
          "apiOverride",
          this.loadConfigToKVConfig(config ?? this.defaultLoadConfig),
        ),
      },
      message => {
        switch (message.type) {
          case "resolved": {
            fullPath = message.info.modelKey;
            if (message.ambiguous !== undefined) {
              this.logger.warn(text`
                Multiple models found for key ${modelKey}:

                ${message.ambiguous.map(x => ` - ${x}`).join("\n")}

                Using the first one.
              `);
            }
            if (verbose) {
              this.logger.logAtLevel(
                verboseLevel,
                text`
                  Start loading model ${fullPath}...
                `,
              );
            }
            break;
          }
          case "success": {
            if (verbose) {
              this.logger.logAtLevel(
                verboseLevel,
                text`
                  Successfully loaded model ${fullPath} in ${Date.now() - startTime}ms
                `,
              );
            }
            resolve(
              this.createDomainSpecificModel(this.port, message.info, this.validator, this.logger),
            );
            break;
          }
          case "progress": {
            const { progress } = message;
            if (onProgress !== undefined) {
              safeCallCallback(this.logger, "onProgress", onProgress, [progress]);
            } else if (verbose) {
              const now = Date.now();
              if (now - lastVerboseCallTime > 500 || progress === 1) {
                const progressText = (progress * 100).toFixed(1);
                this.logger.logAtLevel(
                  verboseLevel,
                  `Loading the model, progress: ${progressText}%`,
                );
                lastVerboseCallTime = now;
              }
            }
          }
        }
      },
      { stack },
    );

    channel.onError.subscribeOnce(reject);

    if (signal !== undefined) {
      if (signal.aborted) {
        // If the signal is already aborted, we should reject immediately.
        channel.send({ type: "cancel" });
        reject(signal.reason);
      } else {
        signal.addEventListener(
          "abort",
          () => {
            channel.send({ type: "cancel" });
            reject(signal.reason);
          },
          { once: true },
        );
      }
    }

    return await promise;
  }

  /**
   * Unload a model. Once a model is unloaded, it can no longer be used. If you wish to use the
   * model afterwards, you will need to load it with {@link LLMNamespace#loadModel} again.
   *
   * @param identifier - The identifier of the model to unload.
   */
  public unload(identifier: string) {
    const stack = getCurrentStack(1);
    this.validator.validateMethodParamOrThrow(
      `client.${this.namespace}`,
      "unload",
      "identifier",
      reasonableKeyStringSchema,
      identifier,
      stack,
    );
    return this.port.callRpc("unloadModel", { identifier }, { stack });
  }

  /**
   * List all the currently loaded models.
   */
  public async listLoaded(): Promise<Array<TSpecificModel>> {
    const stack = getCurrentStack(1);
    const infos = await this.port.callRpc("listLoaded", undefined, { stack });
    return infos.map(info =>
      this.createDomainSpecificModel(this.port, info, this.validator, this.logger),
    );
  }

  /**
   * Get any loaded model of this domain.
   */
  private async getAny(stack: string) {
    const info = await this.port.callRpc(
      "getModelInfo",
      { specifier: { type: "query", query: {} }, throwIfNotFound: true },
      { stack },
    );
    if (info === undefined) {
      throw new Error("Backend should have thrown.");
    }
    return this.createDomainSpecificModel(
      this.port,
      info,
      this.validator,
      new SimpleLogger("LLM", this.logger),
    );
  }

  /**
   * Get a dynamic model handle for any loaded model that satisfies the given query.
   *
   * For more information on the query, see {@link ModelQuery}.
   *
   * Note: The returned handle is not tied to any specific loaded model. Instead, it represents a
   * "handle for a model that satisfies the given query". If the model that satisfies the query is
   * unloaded, the handle will still be valid, but any method calls on it will fail. And later, if a
   * new model is loaded that satisfies the query, the handle will be usable again.
   *
   * You can use {@link DynamicHandle#getModelInfo} to get information about the model that is
   * currently associated with this handle.
   *
   * @example
   *
   * If you have loaded a model with the identifier "my-model", you can use it like this:
   *
   * ```ts
   * const dh = client.llm.createDynamicHandle({ identifier: "my-model" });
   * const prediction = dh.complete("...");
   * ```
   *
   * @example
   *
   * Use the Gemma 2B IT model (given it is already loaded elsewhere):
   *
   * ```ts
   * const dh = client.llm.createDynamicHandle({ path: "lmstudio-community/Meta-Llama-3-8B-Instruct-GGUF" });
   * const prediction = dh.complete("...");
   * ```
   *
   * @param query - The query to use to get the model.
   */
  public createDynamicHandle(query: ModelQuery): TDynamicHandle;
  /**
   * Get a dynamic model handle by its identifier.
   *
   * Note: The returned handle is not tied to any specific loaded model. Instead, it represents a
   * "handle for a model with the given identifier". If the model with the given identifier is
   * unloaded, the handle will still be valid, but any method calls on it will fail. And later, if a
   * new model is loaded with the same identifier, the handle will be usable again.
   *
   * You can use {@link DynamicHandle#getModelInfo} to get information about the model that is
   * currently associated with this handle.
   *
   * @example
   *
   * If you have loaded a model with the identifier "my-model", you can get use it like this:
   *
   * ```ts
   * const dh = client.llm.createDynamicHandle("my-model");
   * const prediction = dh.complete("...");
   * ```
   *
   * @param identifier - The identifier of the model to get.
   */
  public createDynamicHandle(identifier: string): TDynamicHandle;
  public createDynamicHandle(param: string | ModelQuery): TDynamicHandle {
    const stack = getCurrentStack(1);
    this.validator.validateMethodParamOrThrow(
      `client.${this.namespace}`,
      "createDynamicHandle",
      "param",
      z.union([reasonableKeyStringSchema, modelQuerySchema]),
      param,
      stack,
    );
    let query: ModelQuery;
    if (typeof param === "string") {
      query = {
        identifier: param,
      };
    } else {
      query = param;
    }
    if (query.path?.includes("\\")) {
      throw makePrettyError(
        text`
          Model path should not contain backslashes, even if you are on Windows. Use forward
          slashes instead.
        `,
        stack,
      );
    }
    return this.createDomainDynamicHandle(
      this.port,
      {
        type: "query",
        query,
      },
      this.validator,
      new SimpleLogger("DynamicHandle", this.logger),
    );
  }

  /**
   * Create a dynamic handle from the internal instance reference.
   *
   * @alpha
   */
  public createDynamicHandleFromInstanceReference(instanceReference: string): TDynamicHandle {
    const stack = getCurrentStack(1);
    this.validator.validateMethodParamOrThrow(
      `client.${this.namespace}`,
      "createDynamicHandleFromInstanceReference",
      "instanceReference",
      z.string(),
      instanceReference,
      stack,
    );
    return this.createDomainDynamicHandle(
      this.port,
      {
        type: "instanceReference",
        instanceReference,
      },
      this.validator,
      new SimpleLogger("DynamicHandle", this.logger),
    );
  }

  /**
   * Get a model by its identifier. If no model is loaded with such identifier, load a model with
   * the given key. This is the recommended way of getting a model to work with.
   *
   * For example, to use the DeepSeek r1 distill of Llama 8B:
   *
   * ```typescript
   * const model = await client.llm.model("deepseek-r1-distill-llama-8b");
   * ```
   */
  public async model(
    modelKey: string,
    opts?: BaseLoadModelOpts<TLoadModelConfig>,
  ): Promise<TSpecificModel>;
  /**
   * Get any loaded model of this domain. If you want to use a specific model, pass in the model key
   * as a parameter.
   */
  public async model(): Promise<TSpecificModel>;
  public async model(
    modelKey?: string,
    opts: BaseLoadModelOpts<TLoadModelConfig> = {},
  ): Promise<TSpecificModel> {
    const stack = getCurrentStack(1);
    if (modelKey === undefined) {
      // We want to get any loaded model.
      return await this.getAny(stack);
    }
    [modelKey, opts] = this.validator.validateMethodParamsOrThrow(
      `client.${this.namespace}`,
      "model",
      ["modelKey", "opts"],
      [reasonableKeyStringSchema, this.getLoadModelOptsSchema()],
      [modelKey, opts],
      stack,
    );
    const { identifier, signal, verbose = "info", config, onProgress } = opts;

    if (identifier !== undefined) {
      throw new Error("The identifier option is not allowed when using `.model`.");
    }
    let lastVerboseCallTime = 0;

    const { promise, resolve, reject } = makePromise<TSpecificModel>();
    const verboseLevel = typeof verbose === "boolean" ? "info" : verbose;

    const startTime = Date.now();

    const channel = this.port.createChannel(
      "getOrLoad",
      {
        identifier: modelKey,
        loadTtlMs: opts.ttl === undefined ? undefined : opts.ttl * 1000,
        loadConfigStack: singleLayerKVConfigStackOf(
          "apiOverride",
          this.loadConfigToKVConfig(config ?? this.defaultLoadConfig),
        ),
      },
      message => {
        switch (message.type) {
          case "alreadyLoaded": {
            return resolve(
              this.createDomainSpecificModel(this.port, message.info, this.validator, this.logger),
            );
          }
          case "unloadingOtherJITModel": {
            if (verbose) {
              this.logger.logAtLevel(
                verboseLevel,
                text`
                  Unloading other JIT model ${message.info.modelKey}. (You can disable this behavior
                  by going to LM Studio -> Settings -> Developer -> Turn OFF JIT models auto-evict)
                `,
              );
            }
            break;
          }
          case "startLoading": {
            if (verbose) {
              this.logger.logAtLevel(
                verboseLevel,
                text`
                  Verbose logging is enabled. To hide progress logs, set the "verbose" option to
                  false in .model().
                `,
              );
              this.logger.logAtLevel(
                verboseLevel,
                text`
                  Model ${modelKey} is not loaded. Start loading...
                `,
              );
            }
            break;
          }
          case "loadProgress": {
            const { progress } = message;
            if (onProgress !== undefined) {
              safeCallCallback(this.logger, "onProgress", onProgress, [progress]);
            } else if (verbose) {
              const now = Date.now();
              if (now - lastVerboseCallTime > 500 || progress === 1) {
                const progressText = (progress * 100).toFixed(1);
                this.logger.logAtLevel(
                  verboseLevel,
                  `Loading the model, progress: ${progressText}%`,
                );
                lastVerboseCallTime = now;
              }
            }
            break;
          }
          case "loadSuccess": {
            if (verbose) {
              this.logger.logAtLevel(
                verboseLevel,
                text`
                  Successfully loaded model ${message.info.modelKey} in ${Date.now() - startTime}ms
                `,
              );
            }
            resolve(
              this.createDomainSpecificModel(this.port, message.info, this.validator, this.logger),
            );
          }
        }
      },
      { stack },
    );

    channel.onError.subscribeOnce(reject);
    signal?.addEventListener("abort", () => {
      channel.send({ type: "cancel" });
      reject(signal.reason);
    });

    return await promise;
  }
}
