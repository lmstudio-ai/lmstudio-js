import {
  SimpleLogger,
  getCurrentStack,
  handleAbortSignal,
  makePromise,
  safeCallCallback,
  type LoggerInterface,
  type Validator,
} from "@lmstudio/lms-common";
import { type RuntimePort } from "@lmstudio/lms-external-backend-interfaces";
import {
  runtimeEngineSpecifierSchema,
  type DownloadProgressUpdate,
  type DownloadableRuntimeExtensionInfo,
  type RuntimeExtensionSpecifier,
} from "@lmstudio/lms-shared-types";
import { z, type ZodSchema } from "zod";

/**
 * Options to use with {@link RuntimeExtensionsNamespace.search}.
 *
 * @experimental [EXP-RUNTIME-EXTENSION] Runtime extensions related APIs are experimental and may
 * change in the future.
 */
export interface RuntimeExtensionsSearchOpts {
  channel?: string;
  includeIncompatible?: boolean;
}
const runtimeExtensionsSearchOptsSchema = z.object({
  channel: z.string().optional(),
  includeIncompatible: z.boolean().optional(),
}) as ZodSchema<RuntimeExtensionsSearchOpts>;

/**
 * Options to use with {@link RuntimeExtensionsNamespace.download}.
 *
 * @experimental [EXP-RUNTIME-EXTENSION] Runtime extensions related APIs are experimental and may
 * change in the future.
 */
export interface DownloadRuntimeExtensionOpts {
  onProgress?: (update: DownloadProgressUpdate) => void;
  onStartFinalizing?: () => void;
  signal?: AbortSignal;
  /**
   * If another version of this runtime extension is installed and currently selected, controls
   * whether to switch those selections to the newly downloaded version.
   *
   * - false (default): download only; keep existing selections.
   * - true: update selections to the new version.
   *
   * No effect if no other version exists or is being used.
   */
  updateSelections?: boolean;
}
const downloadOptsSchema = z.object({
  onProgress: z.function().optional(),
  onStartFinalizing: z.function().optional(),
  signal: z.instanceof(AbortSignal).optional(),
  updateSelections: z.boolean().optional(),
}) as ZodSchema<DownloadRuntimeExtensionOpts>;

export class RuntimeExtensionsNamespace {
  private readonly logger: SimpleLogger;

  /** @internal */
  public constructor(
    private readonly runtimePort: RuntimePort,
    private readonly validator: Validator,
    parentLogger: LoggerInterface,
  ) {
    this.logger = new SimpleLogger("RuntimeExtensions", parentLogger);
  }

  /**
   * @experimental [EXP-RUNTIME-EXTENSION] Runtime extensions related APIs are experimental and may
   * change in the future.
   */
  public async search(
    query: string,
    opts?: RuntimeExtensionsSearchOpts,
  ): Promise<Array<DownloadableRuntimeExtensionInfo>> {
    const stack = getCurrentStack(1);

    [query, opts = {}] = this.validator.validateMethodParamsOrThrow(
      "client.runtime.extensions",
      "search",
      ["query", "opts"],
      [z.string(), runtimeExtensionsSearchOptsSchema.optional()],
      [query, opts],
      stack,
    );

    const { extensions } = await this.runtimePort.callRpc(
      "searchRuntimeExtensions",
      {
        query,
        channelOverride: opts.channel,
        includeIncompatible: opts.includeIncompatible ?? false,
      },
      { stack },
    );

    return extensions;
  }

  /**
   * @experimental [EXP-RUNTIME-EXTENSION] Runtime extensions related APIs are experimental and may
   * change in the future.
   */
  public async download(
    specifier: RuntimeExtensionSpecifier,
    opts: DownloadRuntimeExtensionOpts,
  ): Promise<void> {
    const stack = getCurrentStack(1);

    [specifier, opts] = this.validator.validateMethodParamsOrThrow(
      "client.runtime.extensions",
      "download",
      ["specifier", "opts"],
      [runtimeEngineSpecifierSchema, downloadOptsSchema],
      [specifier, opts],
      stack,
    );

    const { promise, resolve, reject } = makePromise<void>();
    const channel = this.runtimePort.createChannel(
      "downloadRuntimeExtension",
      {
        name: specifier.name,
        version: specifier.version,
        updateSelections: opts.updateSelections ?? false,
      },
      message => {
        const messageType = message.type;
        switch (messageType) {
          case "downloadProgress": {
            safeCallCallback(this.logger, "onProgress", opts.onProgress, [message.update]);
            break;
          }
          case "startFinalizing": {
            safeCallCallback(this.logger, "onStartFinalizing", opts.onStartFinalizing, []);
            break;
          }
          case "success": {
            resolve();
            return;
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
      if (opts.signal !== undefined && opts.signal.aborted) {
        reject(opts.signal.reason);
      } else {
        reject(error);
      }
    });
    channel.onClose.subscribeOnce(() => {
      if (opts.signal !== undefined && opts.signal.aborted) {
        reject(opts.signal.reason);
      } else {
        reject(new Error("Channel closed unexpectedly."));
      }
    });
    const stopHandleAbortSignal = handleAbortSignal(opts.signal, () => {
      channel.send({ type: "cancel" });
    });
    promise
      .finally(() => {
        stopHandleAbortSignal();
      })
      .catch(() => {});
    return await promise;
  }
}
