import { text } from "@lmstudio/lms-common";
import { findLMStudioHome } from "@lmstudio/lms-common-server";
import { spawn, type SpawnOptionsWithoutStdio } from "child_process";
import { access } from "fs/promises";
import { join } from "path";

export interface UtilBinaryOpts {
  /**
   * If provided, uses the util binary from this folder instead.
   */
  utilsFolderPathOverride?: string;
}

export class UtilBinary {
  private readonly path: string;
  public constructor(
    private readonly name: string,
    { utilsFolderPathOverride }: UtilBinaryOpts = {},
  ) {
    const utilsFolder = utilsFolderPathOverride ?? join(findLMStudioHome(), ".internal", "utils");
    this.path = join(utilsFolder, process.platform === "win32" ? `${name}.exe` : name);
  }
  public async check() {
    try {
      await access(this.path);
    } catch {
      throw new Error(text`
        Cannot locate required dependencies (${this.name}). Please make sure you have the latest version
        of LM Studio installed.
      `);
    }
  }
  public spawn(args: Array<string>, opts?: SpawnOptionsWithoutStdio) {
    return spawn(this.path, args, opts);
  }
  public exec(args: Array<string>) {
    const childProcess = this.spawn(args);
    childProcess.stdout.pipe(process.stdout as any);
    childProcess.stderr.pipe(process.stderr as any);
    return new Promise<void>((resolve, reject) => {
      childProcess.on("exit", code => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(text`${this.name} failed with code ${code ?? "unknown"}`));
        }
      });
    });
  }
}
