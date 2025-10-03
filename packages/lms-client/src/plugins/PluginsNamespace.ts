import {
  getCurrentStack,
  type LoggerInterface,
  makePromise,
  SimpleLogger,
  type Validator,
} from "@lmstudio/lms-common";
import { type PluginsPort } from "@lmstudio/lms-external-backend-interfaces";
import { emptyKVConfig } from "@lmstudio/lms-kv-config";
import {
  artifactIdentifierSchema,
  type KVConfig,
  kvConfigSchema,
  type PluginConfigSpecifier,
  type PluginManifest,
  pluginManifestSchema,
} from "@lmstudio/lms-shared-types";
import { z } from "zod";
import { LLMGeneratorHandle } from "../llm/LLMGeneratorHandle.js";
import { type LMStudioClient } from "../LMStudioClient.js";
import { PluginSelfRegistrationHost } from "./PluginSelfRegistrationHost.js";
import {
  MultiRemoteToolUseSession,
  type RemoteToolUseSession,
  SingleRemoteToolUseSession,
} from "./ToolUseSession.js";

/**
 * Options to use with {@link PluginsNamespace#pluginTools}.
 *
 * @experimental [EXP-USE-USE-PLUGIN-TOOLS] Using tools from other applications is still in
 * development. This may change in the future without warning.
 *
 * @public
 */
interface PluginToolsOpts {
  /**
   * @deprecated [DEP-PLUGIN-RAW-CONFIG] Plugin config access API is still in active development.
   * Stay tuned for updates.
   */
  pluginConfig?: KVConfig;
  /**
   * The working directory to use for the plugin tools. If not provided, the tools provider will not
   * get a working directory.
   */
  workingDirectory?: string;
}
export const pluginToolsOptsSchema = z.object({
  pluginConfig: kvConfigSchema.optional(),
  workingDirectory: z.string().optional(),
});

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
  baseUrl?: string;
  denoBrokerIpcPath?: string;
}

/**
 * Result of {@link PluginsNamespace#registerDevelopmentPlugin}.
 *
 * @public
 */
export interface RegisterDevelopmentPluginResult {
  clientIdentifier: string;
  clientPasskey: string;
  baseUrl?: string;
  /**
   * If the plugin is a sandboxed deno plugin, this is the path to the Deno broker IPC socket.
   */
  denoBrokerIpcPath?: string;
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
   * @experimental [EXP-PLUGIN-CORE] Plugin support is still in development. This may change in the
   * future without warning.
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
            baseUrl: message.baseUrl,
            denoBrokerIpcPath: message.denoBrokerIpcPath,
          });
        }
      },
      { stack },
    );

    let unregisterCalled = false;
    const unregister = async () => {
      if (unregisterCalled) {
        return;
      }
      unregisterCalled = true;
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
   * @experimental [EXP-PLUGIN-CORE] Plugin support is still in development. This may change in the
   * future without warning.
   */
  public async reindexPlugins() {
    const stack = getCurrentStack(1);
    await this.port.callRpc("reindexPlugins", undefined, { stack });
  }

  /**
   * If this client is currently running as a plugin, get the self registration host which can be
   * used to register hooks.
   *
   * @deprecated This method is used by plugins internally to register hooks. Do not use directly.
   */
  public getSelfRegistrationHost() {
    return new PluginSelfRegistrationHost(this.port, this.client, this.rootLogger, this.validator);
  }

  /**
   * Starts a tool use session use any config specifier.
   */
  private async internalStartToolUseSession(
    pluginIdentifier: string,
    pluginConfigSpecifier: PluginConfigSpecifier,
    _stack?: string,
  ): Promise<RemoteToolUseSession> {
    return await SingleRemoteToolUseSession.create(
      this.port,
      pluginIdentifier,
      pluginConfigSpecifier,
      this.logger,
    );
  }

  /**
   * Start a tool use session with a plugin. Note, this method must be used with "Explicit Resource
   * Management". That is, you should use it like so:
   *
   * ```typescript
   * using pluginTools = await client.plugins.pluginTools("owner/name", { ... });
   * // ^ Notice the `using` keyword here.
   * ```
   *
   * If you do not use `using`, you must call `pluginTools[Symbol.dispose]()` after you are done.
   * Otherwise, there will be a memory leak and the plugins you requested tools from will be loaded
   * indefinitely.
   *
   * @experimental [EXP-USE-USE-PLUGIN-TOOLS] Using tools from other applications is still in
   * development. This may change in the future without warning.
   */
  public async pluginTools(
    pluginIdentifier: string,
    opts: PluginToolsOpts = {},
  ): Promise<RemoteToolUseSession> {
    const stack = getCurrentStack(1);
    [pluginIdentifier, opts] = this.validator.validateMethodParamsOrThrow(
      "plugins",
      "pluginTools",
      ["pluginIdentifier", "opts"],
      [artifactIdentifierSchema, pluginToolsOptsSchema],
      [pluginIdentifier, opts],
      stack,
    );

    return await this.internalStartToolUseSession(pluginIdentifier, {
      type: "direct",
      config: opts.pluginConfig ?? emptyKVConfig,
      workingDirectoryPath: opts.workingDirectory,
    });
  }

  /**
   * Start a tool use session associated with a prediction process.
   *
   * This method is used internally by processing controllers and will be stripped by the internal
   * tag.
   *
   * @internal
   */
  public async startToolUseSessionUsingPredictionProcess(
    pluginIdentifiers: Array<string>,
    predictionContextIdentifier: string,
    token: string,
    stack?: string,
  ): Promise<RemoteToolUseSession> {
    return await MultiRemoteToolUseSession.createUsingPredictionProcess(
      this.port,
      pluginIdentifiers,
      predictionContextIdentifier,
      token,
      this.logger,
      stack,
    );
  }

  /**
   * @experimental [EXP-GEN-PREDICT] Using generator plugins programmatically is still in
   * development. This may change in the future without warning.
   */
  public createGeneratorHandle(pluginIdentifier: string): LLMGeneratorHandle {
    return new LLMGeneratorHandle(this.port, pluginIdentifier, this.validator, null, this.logger);
  }

  /**
   * Creates a generator handle that is already associated with a prediction process.
   *
   * This method is used internally by the processing controllers to create generator handles. It is
   * marked as internal and will be stripped.
   *
   * @internal
   */
  public createGeneratorHandleAssociatedWithPredictionProcess(
    pluginIdentifier: string,
    predictionContextIdentifier: string,
    token: string,
  ) {
    return new LLMGeneratorHandle(
      this.port,
      pluginIdentifier,
      this.validator,
      { pci: predictionContextIdentifier, token },
      this.logger,
    );
  }
}
