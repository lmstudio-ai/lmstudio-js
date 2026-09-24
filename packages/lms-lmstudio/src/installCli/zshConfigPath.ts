import os from "node:os";
import { join } from "node:path";

export function getZshConfigPath() {
  const zdotdir = process.env.ZDOTDIR;
  if (typeof zdotdir === "string" && zdotdir.length > 0) {
    return join(zdotdir, ".zshrc");
  }
  return join(os.homedir(), ".zshrc");
}
