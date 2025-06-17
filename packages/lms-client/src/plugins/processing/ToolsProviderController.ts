import { type KVConfig } from "@lmstudio/lms-shared-types";
import { type LMStudioClient } from "../../LMStudioClient.js";
import { BaseController } from "./BaseController.js";

export class ToolsProviderController extends BaseController {
  /**
   * @internal Do not construct this class yourself.
   */
  public constructor(
    client: LMStudioClient,
    signal: AbortSignal,
    pluginConfig: KVConfig,
    globalPluginConfig: KVConfig,
    workingDirectoryPath: string | null,
  ) {
    super(client, signal, pluginConfig, globalPluginConfig, workingDirectoryPath);
  }
}
