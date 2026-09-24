import { type KVConfig } from "@lmstudio/lms-shared-types";
import { kvConfigToMap } from "./KVConfig.js";

/** The launch fields that select config-file mode and its working directory. */
export function isEngineConfigFileField(key: string): boolean {
  return key === "llm.load.engineConfigFileContents" || key === "llm.load.engineCwd";
}

/** Derive mode from the relevant saved, edited, or loaded configuration; never store a flag. */
export function isEngineConfigFileMode(config: KVConfig): boolean {
  const contents = kvConfigToMap(config).get("llm.load.engineConfigFileContents");
  return typeof contents === "string" && contents.length > 0;
}
