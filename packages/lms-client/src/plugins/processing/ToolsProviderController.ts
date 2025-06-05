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
  public constructor(
    public readonly client: LMStudioClient,
    private readonly pluginConfig: KVConfig,
    public readonly signal: AbortSignal,
    private readonly workingDirectoryPath: string | null,
  ) {}

  public getWorkingDirectory(): string {
    if (this.workingDirectoryPath === null) {
      throw new Error("This prediction process is not attached to a working directory.");
    }
    return this.workingDirectoryPath;
  }

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
}
