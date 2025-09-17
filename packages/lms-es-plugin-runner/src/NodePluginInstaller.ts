import { SimpleLogger } from "@lmstudio/lms-common";
import Arborist from "@npmcli/arborist";
import { join } from "path";
import { createEsBuildArgs } from "./esbuildArgs.js";
import { generateEntryFileAt } from "./generateEntryFile.js";
import { UtilBinary } from "./UtilBinary.js";

export interface NodePluginInstallerInstallOpts {
  /**
   * Only installs dependencies. Does not build the plugins.
   */
  dependenciesOnly?: boolean;
  /**
   * Do not install dependencies, only create the entry file and build the plugin.
   */
  skipDependencies?: boolean;
  /**
   * If provided, uses the util binary from this folder instead.
   */
  utilsFolderPathOverride?: string;
  npmRegistry?: string;
  logger?: SimpleLogger;
}

export class NodePluginInstaller {
  /**
   * Creates the esbuild args
   */
  private async createEsBuildArgs(cacheFolderPath: string, entryFilePath: string) {
    const args = createEsBuildArgs({
      entryPath: entryFilePath,
      outPath: join(cacheFolderPath, "production.js"),
      production: true,
    });
    return args;
  }
  public async install(
    pluginPath: string,
    {
      dependenciesOnly = false,
      skipDependencies = false,
      utilsFolderPathOverride,
      npmRegistry,
      logger = new SimpleLogger("DenoPluginInstaller"),
    }: NodePluginInstallerInstallOpts = {},
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
    const entryFilePath = join(cacheFolderPath, "entry.ts");
    await generateEntryFileAt(entryFilePath, {});
    const args = await this.createEsBuildArgs(cacheFolderPath, entryFilePath);
    const esbuild = new UtilBinary("esbuild", { utilsFolderPathOverride });
    logger.info(`Building plugin with esbuild...`);
    await esbuild.check();
    await esbuild.exec(args);
  }
}
