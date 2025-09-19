import { SimpleLogger } from "@lmstudio/lms-common";
import Arborist from "@npmcli/arborist";
import { join } from "path";
import { generateEntryFileAt } from "./generateEntryFile.js";

export interface DenoPluginInstallerInstallOpts {
  /**
   * Only installs dependencies. Does not generate the entry file.
   */
  dependenciesOnly?: boolean;
  /**
   * Do not install dependencies, only create the entry file.
   */
  skipDependencies?: boolean;
  npmRegistry?: string;
  logger?: SimpleLogger;
}

export class DenoPluginInstaller {
  public async install(
    pluginPath: string,
    {
      dependenciesOnly = false,
      skipDependencies = false,
      npmRegistry,
      logger = new SimpleLogger("DenoPluginInstaller"),
    }: DenoPluginInstallerInstallOpts = {},
  ) {
    if (!skipDependencies) {
      const arb = new Arborist({
        path: pluginPath,
        registry: npmRegistry,
        ignoreScripts: true,
      });
      logger.info(`Installing dependencies in ${pluginPath}...`);
      await arb.reify();
    }
    if (dependenciesOnly) {
      return;
    }
    const cacheFolderPath = join(pluginPath, ".lmstudio");
    logger.info(`Creating entry file in ${cacheFolderPath}...`);
    const entryFilePath = join(cacheFolderPath, "production.ts");
    await generateEntryFileAt(entryFilePath, {});
  }
}
