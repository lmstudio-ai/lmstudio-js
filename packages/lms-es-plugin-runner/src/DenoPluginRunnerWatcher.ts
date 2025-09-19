import { Event, type SimpleLogger } from "@lmstudio/lms-common";
import { type FileChangeInfo, watch } from "fs/promises";
import { join } from "path";
import { generateEntryFileAt } from "./generateEntryFile.js";

export class DenoPluginRunnerWatcher {
  public readonly updatedEvent: Event<void>;
  private readonly emitUpdatedEvent: () => void;

  private readonly internalUpdatedEvent: Event<FileChangeInfo<string>>;
  private readonly emitInternalUpdatedEvent: (fileChangeInfo: FileChangeInfo<string>) => void;

  public constructor(
    private readonly projectPath: string,
    private readonly logger: SimpleLogger,
  ) {
    [this.updatedEvent, this.emitUpdatedEvent] = Event.create<void>();
    [this.internalUpdatedEvent, this.emitInternalUpdatedEvent] =
      Event.create<FileChangeInfo<string>>();

    this.internalUpdatedEvent
      .batch({
        minIdleTimeMs: 100,
        maxBatchTimeMs: 500,
      })
      .subscribe(changes => {
        const changedPaths = new Set<string>();
        for (const change of changes) {
          if (change.filename === null) {
            continue;
          }
          // According to Node.js docs, filename can be null for whatever reason
          changedPaths.add(change.filename);
        }
        if (changedPaths.size === 0) {
          // No path obtained but the change was real.
          this.logger.info("Changes detected, restarting...");
        } else {
          const firstChange = changedPaths[Symbol.iterator]().next().value!;
          if (changedPaths.size === 1) {
            this.logger.info(`Change detected in ${firstChange}, restarting...`);
          } else {
            this.logger.infoText`
              Changes detected in ${firstChange} (and +${changedPaths.size - 1}), restarting...
            `;
          }
        }
        this.emitUpdatedEvent();
      });
  }

  private readonly lmstudioCacheFolderPath = join(this.projectPath, ".lmstudio");
  public readonly entryFilePath = join(this.lmstudioCacheFolderPath, "dev.ts");

  private started = false;
  public async start() {
    if (this.started) {
      throw new Error("The watcher has already started.");
    }
    this.started = true;
    await generateEntryFileAt(this.entryFilePath, {});

    // Now we need to watch for changes in the project directory.
    void this.startWatch();

    // Initial event
    this.emitUpdatedEvent();
  }

  private async startWatch() {
    try {
      const watcher = watch(this.projectPath, { recursive: true });
      for await (const event of watcher) {
        this.emitInternalUpdatedEvent(event);
      }
    } catch (err) {
      this.logger.error("Error watching file:", err);
    }
  }
}
