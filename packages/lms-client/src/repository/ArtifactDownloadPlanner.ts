import {
  getCurrentStack,
  makePromise,
  safeCallCallback,
  SimpleLogger,
  type Validator,
} from "@lmstudio/lms-common";
import { type InferClientChannelType } from "@lmstudio/lms-communication";
import { type RepositoryBackendInterface } from "@lmstudio/lms-external-backend-interfaces";
import {
  type ArtifactDownloadPlan,
  type ArtifactDownloadPlanNode,
  type DownloadProgressUpdate,
} from "@lmstudio/lms-shared-types";
import { z } from "zod";

interface ArtifactDownloadPlannerCurrentDownload {
  downloadFinished: () => void;
  downloadJobIdentifierReceived: (downloadJobIdentifier: string) => void;
  startFinalizing: () => void;
  progressUpdate: (update: DownloadProgressUpdate) => void;
  downloadFailed: (error: unknown) => void;
}

interface PendingPlanWaiter {
  minimumVersion: number;
  reject: (error: unknown) => void;
  resolve: () => void;
}

/**
 * Options for the {@link ArtifactDownloadPlanner#download} method.
 *
 * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development. Stay
 * tuned for updates.
 * @public
 */
export interface ArtifactDownloadPlannerDownloadOpts {
  onDownloadJobIdentifier?: (downloadJobIdentifier: string) => void;
  onStartFinalizing?: () => void;
  onProgress?: (update: DownloadProgressUpdate) => void;
  signal?: AbortSignal;
}
const artifactDownloadPlannerDownloadOptsSchema = z.object({
  onDownloadJobIdentifier: z.function().optional(),
  onStartFinalizing: z.function().optional(),
  onProgress: z.function().optional(),
  signal: z.instanceof(AbortSignal).optional(),
});

/**
 * Options for {@link ArtifactDownloadPlanner#selectModelDownloadOption}.
 *
 * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development. Stay
 * tuned for updates.
 * @public
 */
export interface ArtifactDownloadPlannerSelectModelDownloadOptionOpts {
  nodeIndex: number;
  downloadOptionIndex: number;
}
const artifactDownloadPlannerSelectModelDownloadOptionOptsSchema = z.object({
  nodeIndex: z.number().int().min(0),
  downloadOptionIndex: z.number().int().min(0),
});

/**
 * Options for {@link ArtifactDownloadPlanner#selectAlreadyOwnedModel}.
 *
 * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development. Stay
 * tuned for updates.
 * @public
 */
export interface ArtifactDownloadPlannerSelectAlreadyOwnedModelOpts {
  nodeIndex: number;
}
const artifactDownloadPlannerSelectAlreadyOwnedModelOptsSchema = z.object({
  nodeIndex: z.number().int().min(0),
});

interface ArtifactDownloadPlannerSetSelectedDownloadOptionIndexOpts {
  nodeIndex: number;
  selectedDownloadOptionIndex: number | null;
}

type ArtifactDownloadPlannerChannelToServerPacket =
  | {
      type: "cancelDownload";
    }
  | {
      type: "setSelectedDownloadOptionIndex";
      nodeIndex: number;
      selectedDownloadOptionIndex: number | null;
      requestedPlanVersion: number;
    }
  | {
      type: "commit";
    }
  | {
      type: "cancelPlan";
    };

type ArtifactDownloadPlannerChannelToClientPacket =
  | {
      type: "planUpdated";
      plan: ArtifactDownloadPlan;
    }
  | {
      type: "planReady";
      plan: ArtifactDownloadPlan;
    }
  | {
      type: "downloadJobIdentifier";
      downloadJobIdentifier: string;
    }
  | {
      type: "downloadProgress";
      update: DownloadProgressUpdate;
    }
  | {
      type: "startFinalizing";
    }
  | {
      type: "success";
    };

export interface ArtifactDownloadPlannerChannel {
  onMessage: InferClientChannelType<
    RepositoryBackendInterface,
    "createDownloadPlan"
  >["onMessage"] & {
    subscribe: (
      listener: (message: ArtifactDownloadPlannerChannelToClientPacket) => void,
    ) => unknown;
  };
  onError: InferClientChannelType<RepositoryBackendInterface, "createDownloadPlan">["onError"];
  send(packet: ArtifactDownloadPlannerChannelToServerPacket): void;
}

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
  private nextRequestedPlanVersion = 1;
  private planValue: ArtifactDownloadPlan;
  private currentDownload: ArtifactDownloadPlannerCurrentDownload | null = null;
  private readonly pendingPlanWaiters = new Set<PendingPlanWaiter>();
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
    plannerDescription: string,
    initialPlan: ArtifactDownloadPlan,
    private readonly onPlanUpdated: ((plan: ArtifactDownloadPlan) => void) | undefined,
    /** @internal */
    private readonly channel: ArtifactDownloadPlannerChannel,
    private readonly validator: Validator,
    private readonly onDisposed: () => void,
    public readonly signal?: AbortSignal,
  ) {
    this.logger = new SimpleLogger(`ArtifactDownloadPlanner(${plannerDescription})`);
    // Don't unhandled rejection - we don't require user to await on this promise.
    this.readyDeferredPromise.promise.catch(() => {});
    this.planValue = initialPlan;
    this.channel.onMessage.subscribe(message => {
      const messageType = message.type;
      switch (messageType) {
        case "planReady": {
          this.planValue = message.plan;
          this.nextRequestedPlanVersion = Math.max(
            this.nextRequestedPlanVersion,
            message.plan.version + 1,
          );
          this.isReadyBoolean = true;
          this.processPendingPlanWaiters();
          this.readyDeferredPromise.resolve();
          break;
        }
        case "planUpdated": {
          this.planValue = message.plan;
          this.nextRequestedPlanVersion = Math.max(
            this.nextRequestedPlanVersion,
            message.plan.version + 1,
          );
          this.processPendingPlanWaiters();
          safeCallCallback(this.logger, "onPlanUpdated", this.onPlanUpdated, [message.plan]);
          break;
        }
        case "downloadJobIdentifier": {
          if (this.currentDownload === null) {
            throw new Error(
              "Unexpected: received downloadJobIdentifier message without a download.",
            );
          }
          this.currentDownload.downloadJobIdentifierReceived(message.downloadJobIdentifier);
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
        this.rejectPendingPlanWaiters(error);
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
    if (this.isPlanCommited === false && this.isErrored === false) {
      this.channel.send({ type: "cancelPlan" });
    }
    this.rejectPendingPlanWaiters(new Error("Artifact download planner disposed."));
    this.onDisposed();
  }

  private processPendingPlanWaiters() {
    for (const pendingPlanWaiter of [...this.pendingPlanWaiters]) {
      if (this.planValue.version >= pendingPlanWaiter.minimumVersion) {
        this.pendingPlanWaiters.delete(pendingPlanWaiter);
        pendingPlanWaiter.resolve();
      }
    }
  }

  private rejectPendingPlanWaiters(error: unknown) {
    for (const pendingPlanWaiter of this.pendingPlanWaiters) {
      pendingPlanWaiter.reject(error);
    }
    this.pendingPlanWaiters.clear();
  }

  private waitForPlanVersionAtLeast(minimumVersion: number) {
    if (this.planValue.version >= minimumVersion) {
      return Promise.resolve();
    }
    if (this.errorReceivedBeforeDownloadStart !== null) {
      return Promise.reject(this.errorReceivedBeforeDownloadStart);
    }
    const { promise, resolve, reject } = makePromise<void>();
    this.pendingPlanWaiters.add({
      minimumVersion,
      reject,
      resolve,
    });
    return promise;
  }

  private assertCanChangeSelection() {
    if (this.isReadyBoolean === false) {
      throw new Error("Cannot change selection before the plan is ready.");
    }
    if (this.isPlanCommited === true) {
      throw new Error("Cannot change selection after the download has started.");
    }
    if (this.isErrored === true) {
      throw new Error("Cannot change selection because the planner is in an error state.");
    }
  }

  private getModelPlanNodeOrThrow(
    nodeIndex: number,
  ): Extract<ArtifactDownloadPlanNode, { type: "model" }> {
    const planNode = this.planValue.nodes[nodeIndex];
    if (planNode === undefined) {
      throw new Error(`Artifact download plan node ${nodeIndex} does not exist.`);
    }
    if (planNode.type !== "model") {
      throw new Error(`Artifact download plan node ${nodeIndex} is not a model node.`);
    }
    return planNode;
  }

  private async setSelectedDownloadOptionIndex({
    nodeIndex,
    selectedDownloadOptionIndex,
  }: ArtifactDownloadPlannerSetSelectedDownloadOptionIndexOpts) {
    this.assertCanChangeSelection();
    const planNode = this.getModelPlanNodeOrThrow(nodeIndex);
    if (planNode.selectedDownloadOptionIndex === selectedDownloadOptionIndex) {
      return;
    }
    const requestedPlanVersion = this.nextRequestedPlanVersion;
    this.nextRequestedPlanVersion++;
    this.channel.send({
      type: "setSelectedDownloadOptionIndex",
      nodeIndex,
      selectedDownloadOptionIndex,
      requestedPlanVersion,
    });
    await this.waitForPlanVersionAtLeast(requestedPlanVersion);
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

  public async selectModelDownloadOption(
    opts: ArtifactDownloadPlannerSelectModelDownloadOptionOpts,
  ) {
    const stack = getCurrentStack(1);
    const { downloadOptionIndex, nodeIndex } = this.validator.validateMethodParamOrThrow(
      "ArtifactDownloadPlanner",
      "selectModelDownloadOption",
      "opts",
      artifactDownloadPlannerSelectModelDownloadOptionOptsSchema,
      opts,
      stack,
    );
    const planNode = this.getModelPlanNodeOrThrow(nodeIndex);
    const downloadOptions = planNode.downloadOptions;
    if (downloadOptions === undefined) {
      throw new Error(`Model node ${nodeIndex} does not have resolved download options.`);
    }
    if (downloadOptionIndex >= downloadOptions.length) {
      throw new Error(
        `Model node ${nodeIndex} does not have download option ${downloadOptionIndex}.`,
      );
    }
    await this.setSelectedDownloadOptionIndex({
      nodeIndex,
      selectedDownloadOptionIndex: downloadOptionIndex,
    });
  }

  public async selectAlreadyOwnedModel(opts: ArtifactDownloadPlannerSelectAlreadyOwnedModelOpts) {
    const stack = getCurrentStack(1);
    const { nodeIndex } = this.validator.validateMethodParamOrThrow(
      "ArtifactDownloadPlanner",
      "selectAlreadyOwnedModel",
      "opts",
      artifactDownloadPlannerSelectAlreadyOwnedModelOptsSchema,
      opts,
      stack,
    );
    const planNode = this.getModelPlanNodeOrThrow(nodeIndex);
    if (planNode.alreadyOwned === undefined) {
      throw new Error(`Model node ${nodeIndex} does not have an already owned selection.`);
    }
    await this.setSelectedDownloadOptionIndex({
      nodeIndex,
      selectedDownloadOptionIndex: null,
    });
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

    const {
      onDownloadJobIdentifier,
      onProgress,
      onStartFinalizing,
      signal = new AbortController().signal,
    } = opts;
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
      downloadJobIdentifierReceived: downloadJobIdentifier => {
        safeCallCallback(this.logger, "onDownloadJobIdentifier", onDownloadJobIdentifier, [
          downloadJobIdentifier,
        ]);
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
