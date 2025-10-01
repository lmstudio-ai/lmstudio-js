import {
  getCurrentStack,
  makePromise,
  safeCallCallback,
  SimpleLogger,
  type Validator,
} from "@lmstudio/lms-common";
import { type InferClientChannelType } from "@lmstudio/lms-communication";
import { type RepositoryBackendInterface } from "@lmstudio/lms-external-backend-interfaces";
import { type ArtifactDownloadPlan, type DownloadProgressUpdate } from "@lmstudio/lms-shared-types";
import { z } from "zod";

interface ArtifactDownloadPlannerCurrentDownload {
  downloadFinished: () => void;
  startFinalizing: () => void;
  progressUpdate: (update: DownloadProgressUpdate) => void;
  downloadFailed: (error: any) => void;
}

/**
 * Options for the {@link ArtifactDownloadPlanner#download} method.
 *
 * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development. Stay
 * tuned for updates.
 * @public
 */
export interface ArtifactDownloadPlannerDownloadOpts {
  onStartFinalizing?: () => void;
  onProgress?: (update: DownloadProgressUpdate) => void;
  signal?: AbortSignal;
}
const artifactDownloadPlannerDownloadOptsSchema = z.object({
  onStartFinalizing: z.function().optional(),
  onProgress: z.function().optional(),
  signal: z.instanceof(AbortSignal).optional(),
});

/**
 * Represents a planner to download an artifact. The plan is not guaranteed to be ready until you
 * await on the method "untilReady".
 *
 * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development. Stay
 * tuned for updates.
 * @public
 */
export class ArtifactDownloadPlanner {
  private readyDeferredPromise = makePromise<void>();
  private readonly logger: SimpleLogger;
  private isReadyBoolean = false;
  private isPlanCommited: boolean = false;
  private isErrored: boolean = false;
  private planValue: ArtifactDownloadPlan;
  private currentDownload: ArtifactDownloadPlannerCurrentDownload | null = null;
  /**
   * If we received an error after the download starts, we will just raise the error in the download
   * promise.
   *
   * However, if the error was received before download was called (e.g. plan resolution failed),
   * we will store the error here and throw it as soon as `.download` is called. In addition, we
   * will also raise the error in the ready promise. However, since it is not required to attach
   * a listener there
   */
  private errorReceivedBeforeDownloadStart: Error | null = null;
  /**
   * @internal Do not construct this class yourself.
   */
  public constructor(
    public readonly owner: string,
    public readonly name: string,
    private readonly onPlanUpdated: ((plan: ArtifactDownloadPlan) => void) | undefined,
    /** @internal */
    private readonly channel: InferClientChannelType<
      RepositoryBackendInterface,
      "createArtifactDownloadPlan"
    >,
    private readonly validator: Validator,
    private readonly onDisposed: () => void,
    public readonly signal?: AbortSignal,
  ) {
    this.logger = new SimpleLogger(`ArtifactDownloadPlanner(${owner}/${name})`);
    // Don't unhandled rejection - we don't require user to await on this promise.
    this.readyDeferredPromise.promise.catch(() => {});
    this.planValue = {
      nodes: [
        {
          type: "artifact",
          owner,
          name,
          state: "pending",
          dependencyNodes: [],
        },
      ],
      downloadSizeBytes: 0,
    };
    this.channel.onMessage.subscribe(message => {
      const messageType = message.type;
      switch (messageType) {
        case "planReady": {
          this.isReadyBoolean = true;
          this.readyDeferredPromise.resolve();
          this.planValue = message.plan;
          break;
        }
        case "planUpdated": {
          this.planValue = message.plan;
          safeCallCallback(this.logger, "onPlanUpdated", this.onPlanUpdated, [message.plan]);
          break;
        }
        case "success": {
          if (this.currentDownload === null) {
            throw new Error("Unexpected: received success message without a download.");
          }
          this.currentDownload.downloadFinished();
          break;
        }
        case "downloadProgress": {
          if (this.currentDownload === null) {
            throw new Error("Unexpected: received progress message without a download.");
          }
          this.currentDownload.progressUpdate(message.update);
          break;
        }
        case "startFinalizing": {
          if (this.currentDownload === null) {
            throw new Error("Unexpected: received startFinalizing message without a download.");
          }
          this.currentDownload.startFinalizing();
          break;
        }
      }
    });
    this.channel.onError.subscribeOnce(error => {
      if (this.currentDownload === null) {
        this.errorReceivedBeforeDownloadStart = error;
        this.readyDeferredPromise.reject(error);
      } else {
        this.currentDownload.downloadFailed(error);
      }
      this.isErrored = true;
    });
    if (this.signal !== undefined) {
      if (this.signal.aborted) {
        this.channel.send({ type: "cancelPlan" });
      } else {
        this.signal.addEventListener("abort", () => {
          this.channel.send({ type: "cancelPlan" });
        });
      }
    }
  }

  public [Symbol.dispose]() {
    // If the channel is still open, we need to cancel the plan. This ensures we don't cancel the
    // download even if the download planner goes out of scope.
    if (this.isPlanCommited === false && this.isErrored == false) {
      this.channel.send({ type: "cancelPlan" });
    }
    this.onDisposed();
  }

  public isReady() {
    return this.isReadyBoolean;
  }
  public async untilReady() {
    return await this.readyDeferredPromise.promise;
  }
  public getPlan() {
    return this.planValue;
  }
  /**
   * Download this artifact. `download` can only be called once.
   */
  public async download(opts: ArtifactDownloadPlannerDownloadOpts) {
    const stack = getCurrentStack(1);
    opts = this.validator.validateMethodParamOrThrow(
      "ArtifactDownloadPlanner",
      "download",
      "opts",
      artifactDownloadPlannerDownloadOptsSchema,
      opts,
      stack,
    );

    const { onProgress, onStartFinalizing, signal = new AbortController().signal } = opts;
    if (this.currentDownload !== null) {
      throw new Error("You can only call `download` once for each planner.");
    }
    if (this.errorReceivedBeforeDownloadStart !== null) {
      // There has been an error. Raise it immediately.
      const error = this.errorReceivedBeforeDownloadStart;
      this.errorReceivedBeforeDownloadStart = null;
      throw error;
    }
    const { promise, resolve, reject } = makePromise<void>();
    this.currentDownload = {
      downloadFinished: () => {
        resolve();
      },
      startFinalizing: () => {
        safeCallCallback(this.logger, "onStartFinalizing", onStartFinalizing, []);
      },
      progressUpdate: update => {
        safeCallCallback(this.logger, "onProgress", onProgress, [update]);
      },
      downloadFailed: error => {
        reject(error);
      },
    };
    this.channel.send({ type: "commit" });
    this.isPlanCommited = true;
    // Here we send cancel because the signal was aborted from the outside. This means the user
    // doesn't want to continue the download
    if (signal.aborted) {
      this.channel.send({ type: "cancelDownload" });
    } else {
      signal.addEventListener("abort", () => {
        this.channel.send({ type: "cancelDownload" });
      });
    }
    return await promise.catch(error => {
      if (signal.aborted) {
        // If the signal was aborted, we need to reject with the reason of the abort.
        throw signal.reason;
      } else {
        // Otherwise, we just reject with the error.
        throw error;
      }
    });
  }
}
