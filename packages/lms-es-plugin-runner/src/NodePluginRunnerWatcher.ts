import { Event, SimpleLogger } from "@lmstudio/lms-common";
import { join } from "path";
import { type UtilBinary } from "./UtilBinary.js";
import { createEsBuildArgs } from "./esbuildArgs.js";
import { generateEntryFileAt } from "./generateEntryFile.js";

const buildFinishedTriggerString = "build finished";
const trimPrefix = "[watch] ";
const trimSuffix = "\n";

export class NodePluginRunnerWatcher {
  public readonly updatedEvent: Event<void>;
  private readonly emitUpdateEvent: () => void;

  public constructor(
    private readonly esbuild: UtilBinary,
    private readonly projectPath: string,
    private readonly logger: SimpleLogger,
  ) {
    [this.updatedEvent, this.emitUpdateEvent] = Event.create<void>();
  }

  private readonly lmstudioCacheFolderPath = join(this.projectPath, ".lmstudio");
  private readonly entryFilePath = join(this.lmstudioCacheFolderPath, "entry.ts");

  private started = false;
  public async start() {
    if (this.started) {
      throw new Error("The watcher has already started.");
    }
    this.started = true;
    await this.esbuild.check();
    await generateEntryFileAt(this.entryFilePath, {});
    const args = await this.createEsBuildArgs(this.entryFilePath);
    const esbuildProcess = this.esbuild.spawn(args);
    const esbuildLogger = new SimpleLogger("esbuild", this.logger);

    // Detect the "build finished" string in the output. Not most performant solution, but works.
    let stringBuffer = "";
    // Esbuild logs to stderr
    esbuildProcess.stderr.on("data", (data: Buffer) => {
      let string = data.toString("utf-8");
      if (string.startsWith(trimPrefix)) {
        string = string.slice(trimPrefix.length);
      }
      if (string.endsWith(trimSuffix)) {
        string = string.slice(0, -trimSuffix.length);
      }
      esbuildLogger.info(string);
      stringBuffer += string;
      if (stringBuffer.includes(buildFinishedTriggerString)) {
        this.emitUpdateEvent();
      }
      // Keep the last buildFinishedTriggerString.length - 1 characters
      stringBuffer = stringBuffer.slice(-buildFinishedTriggerString.length + 1);
    });
  }

  /**
   * Creates the esbuild args
   */
  private async createEsBuildArgs(entryFilePath: string) {
    const args = createEsBuildArgs({
      entryPath: entryFilePath,
      outPath: join(this.lmstudioCacheFolderPath, "dev.js"),
      watch: true,
      production: false,
    });
    return args;
  }
}
