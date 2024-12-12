import { makeTitledPrettyError, text } from "@lmstudio/lms-common";
import { findLMStudioHome } from "@lmstudio/lms-common-server";
import chalk from "chalk";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { platform } from "node:process";
import { installCliDarwinOrLinux } from "./darwinOrLinux.js";
import { installCliWin32 } from "./win32.js";

export interface InstallCliOpts {
  skipConfirmation?: boolean;
}

export async function installCli(opts: InstallCliOpts = {}) {
  const targetPath = join(`${findLMStudioHome()}`, `bin`);
  const pathStat = await stat(targetPath).catch(() => null);
  if (pathStat === null || pathStat.isDirectory() === false) {
    throw makeTitledPrettyError(
      "Cannot find LM Studio installation",
      text`
        LM Studio CLI (lms) is shipped with the latest version of LM Studio. Please install LM
        Studio first. You can download it from:

            ${chalk.cyanBright("https://lmstudio.ai/")}

        If you have just installed LM Studio, please run it at least once before running this tool
        again.
      `,
    );
  }
  if (platform === "win32") {
    await installCliWin32(targetPath, opts);
    // await installCliWin32(targetPath);
  } else if (platform === "linux" || platform === "darwin") {
    await installCliDarwinOrLinux(targetPath, opts);
  } else {
    throw makeTitledPrettyError(
      `Your platform (${chalk.yellowBright(platform)}) is not support by this tool`,
      text`
        To complete the setup manually, please try to add the following directory to the PATH
        environment variable:

            ${chalk.yellowBright(targetPath)}
      `,
    );
  }
}
