import {
  type GlobalKVFieldValueTypeLibraryMap,
  type KVConfigSchematics,
} from "@lmstudio/lms-kv-config";
import { type KVConfig } from "@lmstudio/lms-shared-types";
import { type LMStudioClient } from "../../LMStudioClient.js";
import {
  type ConfigSchematics,
  type ParsedConfig,
  type VirtualConfigSchematics,
} from "../../customConfig.js";

/**
 * The base class for all controllers.
 *
 * @public
 * @experimental [EXP-PLUGIN-CORE] Plugin support is still in development. This may change in the
 * future without warning.
 */
export abstract class BaseController {
  public constructor(
    /**
     * The LM Studio client instance. Use this to interact with the LM Studio API.
     */
    public readonly client: LMStudioClient,
    /**
     * The abort signal that you should listen to for cancellation requests.
     *
     * See https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal for more information about
     * abort signals.
     */
    public readonly abortSignal: AbortSignal,
    private readonly pluginConfig: KVConfig,
    private readonly globalPluginConfig: KVConfig,
    private readonly workingDirectoryPath: string | null,
  ) {}

  /**
   * Gets the working directory for the current prediction. If your plugin produces files, you
   * should aim to put them in this directory.
   */
  public getWorkingDirectory(): string {
    if (this.workingDirectoryPath === null) {
      throw new Error("This prediction process is not attached to a working directory.");
    }
    return this.workingDirectoryPath;
  }

  /**
   * Get the per-chat config for the plugin. Takes in the configSchematics. You can get the
   * values of fields like so:
   *
   * ```ts
   * const config = ctl.getPluginConfig(configSchematics);
   * const value = config.get("fieldKey");
   * ```
   *
   * @remarks
   *
   * If you need to name the type of the returned value, use:
   *
   * `InferParsedConfig<typeof configSchematics>`.
   *
   * Example:
   *
   * ```ts
   * function myFunction(config: InferParsedConfig<typeof configSchematics>) {
   *   // ...
   * }
   *
   * myFunction(ctl.getPluginConfig(configSchematics));
   * ```
   */
  public getPluginConfig<TVirtualConfigSchematics extends VirtualConfigSchematics>(
    configSchematics: ConfigSchematics<TVirtualConfigSchematics>,
  ): ParsedConfig<TVirtualConfigSchematics> {
    return (
      configSchematics as KVConfigSchematics<
        GlobalKVFieldValueTypeLibraryMap,
        TVirtualConfigSchematics
      >
    ).parse(this.pluginConfig);
  }

  /**
   * Get the application-wide config for the plugin. Takes in the globalConfigSchematics. You can
   * get the values of fields like so:
   *
   * ```ts
   * const config = ctl.getGlobalPluginConfig(globalConfigSchematics);
   * const value = config.get("fieldKey");
   * ```
   *
   * @remarks
   *
   * If you need to name the type of the returned value, use:
   *
   * `InferParsedConfig<typeof globalConfigSchematics>`.
   *
   * Example:
   *
   * ```ts
   * function myFunction(config: InferParsedConfig<typeof globalConfigSchematics>) {
   *   // ...
   * }
   *
   * myFunction(ctl.getGlobalPluginConfig(globalConfigSchematics));
   * ```
   */
  public getGlobalPluginConfig<TVirtualConfigSchematics extends VirtualConfigSchematics>(
    globalConfigSchematics: ConfigSchematics<TVirtualConfigSchematics>,
  ): ParsedConfig<TVirtualConfigSchematics> {
    return (
      globalConfigSchematics as KVConfigSchematics<
        GlobalKVFieldValueTypeLibraryMap,
        TVirtualConfigSchematics
      >
    ).parse(this.globalPluginConfig);
  }

  /**
   * Provides a callback that will be called when the prediction is aborted. If the prediction is
   * already aborted, the callback will be called immediately.
   *
   * You can also use {@link BaseController.abortSignal} if you are using an async function that
   * supports abort signals.
   *
   * See https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal for more information about
   * abort signals.
   */
  public onAborted(callback: () => void): void {
    if (this.abortSignal.aborted) {
      callback();
    } else {
      this.abortSignal.addEventListener("abort", callback, { once: true });
    }
  }
}
