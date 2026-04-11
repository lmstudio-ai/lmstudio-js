import os from "node:os";
import { join } from "node:path";

export interface ShellInstallationInfo {
  shellName: string;
  configFileName: string;
}

export function resolveConfigPath(shell: ShellInstallationInfo) {
  if (shell.shellName === "zsh") {
    const zdotdir = process.env.ZDOTDIR;
    if (typeof zdotdir === "string" && zdotdir.length > 0) {
      return join(zdotdir, shell.configFileName);
    }
  }
  return join(os.homedir(), shell.configFileName);
}
