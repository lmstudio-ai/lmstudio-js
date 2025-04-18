import {
  getCurrentStack,
  makePromise,
  safeCallCallback,
  type SimpleLogger,
  type Validator,
} from "@lmstudio/lms-common";
import { type RepositoryPort } from "@lmstudio/lms-external-backend-interfaces";
import {
  type DownloadProgressUpdate,
  type ModelSearchResultDownloadOptionData,
  type ModelSearchResultDownloadOptionFitEstimation,
} from "@lmstudio/lms-shared-types";
import { z } from "zod";

/** @public */
export interface DownloadOpts {
  onProgress?: (update: DownloadProgressUpdate) => void;
  onStartFinalizing?: () => void;
  signal?: AbortSignal;
}
const downloadOptsSchema = z.object({
  onProgress: z.function().optional(),
  onStartFinalizing: z.function().optional(),
  signal: z.instanceof(AbortSignal).optional(),
});

/** @public */
export class ModelSearchResultDownloadOption {
  public readonly quantization?: string;
  public readonly name: string;
  public readonly sizeBytes: number;
  public readonly fitEstimation?: ModelSearchResultDownloadOptionFitEstimation;
  public readonly indexedModelIdentifier: string;
  /** @internal */
  public constructor(
    /** @internal */
    private readonly repositoryPort: RepositoryPort,
    /** @internal */
    private readonly validator: Validator,
    private readonly logger: SimpleLogger,
    private readonly data: ModelSearchResultDownloadOptionData,
  ) {
    this.quantization = data.quantization;
    this.name = data.name;
    this.sizeBytes = data.sizeBytes;
    this.fitEstimation = this.data.fitEstimation;
    this.indexedModelIdentifier = this.data.indexedModelIdentifier;
  }
  public isRecommended() {
    return this.data.recommended ?? false;
  }
  /**
   * Download the model. Returns the model key which can be used to load the model.
   */
  public async download(opts: DownloadOpts = {}) {
    const stack = getCurrentStack(1);
    this.validator.validateMethodParamOrThrow(
      "ModelSearchResultDownloadOption",
      "download",
      "opts",
      downloadOptsSchema,
      opts,
      stack,
    );
    const { promise, resolve, reject } = makePromise<string>();
    const channel = this.repositoryPort.createChannel(
      "downloadModel",
      {
        downloadIdentifier: this.data.downloadIdentifier,
      },
      message => {
        switch (message.type) {
          case "downloadProgress": {
            safeCallCallback(this.logger, "onProgress", opts.onProgress, [message.update]);
            break;
          }
          case "startFinalizing": {
            safeCallCallback(this.logger, "onStartFinalizing", opts.onStartFinalizing, []);
            break;
          }
          case "success": {
            resolve(message.defaultIdentifier);
            break;
          }
          default: {
            const exhaustiveCheck: never = message;
            throw new Error(`Unexpected message type: ${exhaustiveCheck}`);
          }
        }
      },
      { stack },
    );
    channel.onError.subscribeOnce(error => {
      if (opts.signal?.aborted) {
        reject(opts.signal.reason);
      } else {
        reject(error);
      }
    });
    channel.onClose.subscribeOnce(() => {
      if (opts.signal?.aborted) {
        reject(opts.signal.reason);
      } else {
        reject(new Error("Channel closed unexpectedly."));
      }
    });
    const abortListener = () => {
      channel.send({ type: "cancel" });
    };
    opts.signal?.addEventListener("abort", abortListener);
    promise.finally(() => {
      opts.signal?.removeEventListener("abort", abortListener);
    });
    return await promise;
  }
}
