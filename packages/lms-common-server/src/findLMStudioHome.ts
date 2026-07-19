import { existsSync, readFileSync, realpathSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join, resolve } from "path";

let lmstudioHome: string | null = null;

export function findLMStudioHome() {
  if (lmstudioHome !== null) {
    return lmstudioHome;
  }

  // LMSTUDIO_HOME environment variable takes precedence
  const envHome = process.env.LMSTUDIO_HOME
  if (envHome) {
    lmstudioHome = resolve(envHome)
    return lmstudioHome
  }

  // if applicable, convert relative path to absolute and follow the symlink
  const resolvedHomeDir = realpathSync(homedir());

  const pointerFilePath = join(resolvedHomeDir, ".lmstudio-home-pointer");
  if (existsSync(pointerFilePath)) {
    lmstudioHome = readFileSync(pointerFilePath, "utf-8").trim();
    return lmstudioHome;
  }

  // See if ~/.cache/lm-studio exists. If it does, use it.
  const cacheHome = join(resolvedHomeDir, ".cache", "lm-studio");
  if (existsSync(cacheHome)) {
    lmstudioHome = cacheHome;
    writeFileSync(pointerFilePath, lmstudioHome, "utf-8");
    return lmstudioHome;
  }

  // Otherwise, fallback to ~/.lmstudio
  const home = join(resolvedHomeDir, ".lmstudio");
  lmstudioHome = home;
  writeFileSync(pointerFilePath, lmstudioHome, "utf-8");
  return lmstudioHome;
}
