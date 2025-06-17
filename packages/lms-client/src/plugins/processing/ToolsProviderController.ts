import {
  type GlobalKVFieldValueTypeLibraryMap,
  type KVConfigSchematics,
} from "@lmstudio/lms-kv-config";
import { type KVConfig } from "@lmstudio/lms-shared-types";
import {
  type ConfigSchematics,
  type ParsedConfig,
  type VirtualConfigSchematics,
} from "../../customConfig";
import { type LMStudioClient } from "../../LMStudioClient";

export class ToolsProviderController {
  /**
   * @internal Do not construct this class yourself.
   */
  public constructor(
    public readonly client: LMStudioClient,
    private readonly pluginConfig: KVConfig,
    private readonly globalPluginConfig: KVConfig,
    private readonly workingDirectoryPath: string | null,
    public readonly signal: AbortSignal,
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
}
