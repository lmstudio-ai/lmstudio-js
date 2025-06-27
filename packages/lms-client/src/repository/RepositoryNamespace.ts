import {
  getCurrentStack,
  makePromise,
  safeCallCallback,
  SimpleLogger,
  type LoggerInterface,
  type Validator,
} from "@lmstudio/lms-common";
import { type RepositoryPort } from "@lmstudio/lms-external-backend-interfaces";
import {
  jsonSerializableSchema,
  modelSearchOptsSchema,
  type ArtifactDownloadPlan,
  type DownloadProgressUpdate,
  type LocalArtifactFileList,
  type ModelSearchOpts,
} from "@lmstudio/lms-shared-types";
import { z, type ZodSchema } from "zod";
import { ArtifactDownloadPlanner } from "./ArtifactDownloadPlanner.js";
import { ModelSearchResultEntry } from "./ModelSearchResultEntry.js";

/**
 * Options to use with {@link RepositoryNamespace#downloadArtifact}
 *
 * @public
 */
export interface DownloadArtifactOpts {
  owner: string;
  name: string;
  revisionNumber: number;
  /**
   * Where to save the artifact.
   */
  path: string;
  onProgress?: (update: DownloadProgressUpdate) => void;
  onStartFinalizing?: () => void;
  signal?: AbortSignal;
}
const downloadArtifactOptsSchema = z.object({
  owner: z.string(),
  name: z.string(),
  revisionNumber: z.number(),
  path: z.string(),
  onProgress: z.function().optional(),
  onStartFinalizing: z.function().optional(),
  signal: z.instanceof(AbortSignal).optional(),
}) as ZodSchema<DownloadArtifactOpts>;

/**
 * Options to use with {@link RepositoryNamespace#pushArtifact}.
 *
 * @public
 */
export interface PushArtifactOpts {
  path: string;
  /**
   * Change the description of the artifact.
   */
  description?: string;
  /**
   * Request to make the artifact private. Only effective if the artifact did not exist before. Will
   * not change the visibility of an existing artifact.
   */
  makePrivate?: boolean;
  /**
   * If true, will write the revision number of the artifact after the push back to the artifact
   * manifest.json.
   */
  writeRevision?: boolean;
  /**
   * Internal overrides for updating artifact metadata.
   */
  overrides?: any;
  onMessage?: (message: string) => void;
}
export const pushArtifactOptsSchema = z.object({
  path: z.string(),
  description: z.string().optional(),
  makePrivate: z.boolean().optional(),
  writeRevision: z.boolean().optional(),
  overrides: jsonSerializableSchema.optional(),
  onMessage: z.function().optional(),
}) as ZodSchema<PushArtifactOpts>;

/**
 * Options to use with {@link RepositoryNamespace#ensureAuthenticated}.
 *
 * @public
 */
export interface EnsureAuthenticatedOpts {
  onAuthenticationUrl: (url: string) => void;
}
export const ensureAuthenticatedOptsSchema = z.object({
  onAuthenticationUrl: z.function(),
}) as ZodSchema<EnsureAuthenticatedOpts>;

/**
 * Options to use with {@link RepositoryNamespace#loginWithPreAuthenticatedKeys}.
 *
 * @public
 */
export interface LoginWithPreAuthenticatedKeysOpts {
  keyId: string;
  publicKey: string;
  privateKey: string;
}
export const loginWithPreAuthenticatedKeysOptsSchema = z.object({
  keyId: z.string(),
  publicKey: z.string(),
  privateKey: z.string(),
}) as ZodSchema<LoginWithPreAuthenticatedKeysOpts>;

/**
 * Result of {@link RepositoryNamespace#loginWithPreAuthenticatedKeys}.
 *
 * @public
 */
export interface LoginWithPreAuthenticatedKeysResult {
  userName: string;
}
export const loginWithPreAuthenticatedKeysResultSchema = z.object({
  userName: z.string(),
}) as ZodSchema<LoginWithPreAuthenticatedKeysResult>;

/**
 * Options to use with {@link RepositoryNamespace#createArtifactDownloadPlanner}.
 *
 * @public
 */
export interface CreateArtifactDownloadPlannerOpts {
  owner: string;
  name: string;
  onPlanUpdated?: (plan: ArtifactDownloadPlan) => void;
}
export const createArtifactDownloadPlannerOptsSchema = z.object({
  owner: z.string(),
  name: z.string(),
  onPlanUpdated: z.function().optional(),
}) as ZodSchema<CreateArtifactDownloadPlannerOpts>;

/** @public */
export class RepositoryNamespace {
  /** @internal */
  private readonly logger: SimpleLogger;
  /** @internal */
  public constructor(
    private readonly repositoryPort: RepositoryPort,
    private readonly validator: Validator,
    parentLogger: LoggerInterface,
  ) {
    this.logger = new SimpleLogger("Repository", parentLogger);
  }

  public async searchModels(opts: ModelSearchOpts): Promise<Array<ModelSearchResultEntry>> {
    const stack = getCurrentStack(1);
    opts = this.validator.validateMethodParamOrThrow(
      "repository",
      "search",
      "opts",
      modelSearchOptsSchema,
      opts,
      stack,
    );
    const { results } = await this.repositoryPort.callRpc("searchModels", { opts }, { stack });
    return results.map(
      data => new ModelSearchResultEntry(this.repositoryPort, this.validator, this.logger, data),
    );
  }

  /**
   * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development. Stay
   * tuned for updates.
   */
  public async installPluginDependencies(pluginFolder: string) {
    const stack = getCurrentStack(1);
    this.validator.validateMethodParamOrThrow(
      "repository",
      "installPluginDependencies",
      "pluginFolder",
      z.string(),
      pluginFolder,
      stack,
    );
    await this.repositoryPort.callRpc("installPluginDependencies", { pluginFolder }, { stack });
  }

  /**
   * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development. Stay
   * tuned for updates.
   */
  public async downloadArtifact(opts: DownloadArtifactOpts) {
    const stack = getCurrentStack(1);
    this.validator.validateMethodParamOrThrow(
      "client.repository",
      "downloadArtifact",
      "opts",
      downloadArtifactOptsSchema,
      opts,
      stack,
    );
    const { owner, name, revisionNumber, path, onProgress, onStartFinalizing, signal } = opts;
    const { promise, resolve, reject } = makePromise<void>();
    const channel = this.repositoryPort.createChannel(
      "downloadArtifact",
      { artifactOwner: owner, artifactName: name, revisionNumber, path },
      message => {
        switch (message.type) {
          case "downloadProgress": {
            safeCallCallback(this.logger, "onProgress", onProgress, [message.update]);
            break;
          }
          case "startFinalizing": {
            safeCallCallback(this.logger, "onStartFinalizing", onStartFinalizing, []);
            break;
          }
          case "success": {
            resolve();
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
    channel.onError.subscribeOnce(reject);
    channel.onClose.subscribeOnce(() => {
      if (signal?.aborted) {
        reject(signal.reason);
      } else {
        reject(new Error("Channel closed unexpectedly."));
      }
    });
    const abortListener = () => {
      channel.send({ type: "cancel" });
    };
    signal?.addEventListener("abort", abortListener);
    promise.finally(() => {
      signal?.removeEventListener("abort", abortListener);
    });
    return await promise;
  }

  /**
   * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development. Stay
   * tuned for updates.
   */
  public async pushArtifact(opts: PushArtifactOpts): Promise<void> {
    const stack = getCurrentStack(1);
    const { path, description, makePrivate, writeRevision, overrides, onMessage } =
      this.validator.validateMethodParamOrThrow(
        "repository",
        "pushArtifact",
        "opts",
        pushArtifactOptsSchema,
        opts,
        stack,
      );
    const channel = this.repositoryPort.createChannel(
      "pushArtifact",
      { path, description, makePrivate, writeRevision, overrides },
      message => {
        const type = message.type;
        switch (type) {
          case "message": {
            safeCallCallback(this.logger, "onMessage", onMessage, [message.message]);
            break;
          }
          default: {
            const exhaustiveCheck: never = type;
            throw new Error(`Unexpected message type: ${exhaustiveCheck}`);
          }
        }
      },
      { stack },
    );
    const { promise, resolve, reject } = makePromise<void>();
    channel.onError.subscribeOnce(reject);
    channel.onClose.subscribeOnce(resolve);
    await promise;
  }

  /**
   * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development. Stay
   * tuned for updates.
   */
  public async getLocalArtifactFileList(path: string): Promise<LocalArtifactFileList> {
    const stack = getCurrentStack(1);
    this.validator.validateMethodParamOrThrow(
      "repository",
      "getLocalArtifactFileList",
      "path",
      z.string(),
      path,
      stack,
    );
    const { fileList } = await this.repositoryPort.callRpc(
      "getLocalArtifactFiles",
      { path },
      { stack },
    );
    return fileList;
  }

  /**
   * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development. Stay
   * tuned for updates.
   */
  public async ensureAuthenticated(opts: EnsureAuthenticatedOpts) {
    const stack = getCurrentStack(1);
    this.validator.validateMethodParamOrThrow(
      "repository",
      "ensureAuthenticated",
      "opts",
      ensureAuthenticatedOptsSchema,
      opts,
      stack,
    );
    const { promise, resolve, reject } = makePromise<void>();
    const channel = this.repositoryPort.createChannel("ensureAuthenticated", undefined, message => {
      const type = message.type;
      switch (type) {
        case "authenticationUrl": {
          safeCallCallback(this.logger, "onAuthenticationUrl", opts.onAuthenticationUrl, [
            message.url,
          ]);
          break;
        }
        case "authenticated": {
          resolve();
          break;
        }
        default: {
          const exhaustiveCheck: never = type;
          throw new Error(`Unexpected message type: ${exhaustiveCheck}`);
        }
      }
    });
    channel.onError.subscribeOnce(reject);
    await promise;
  }

  public async loginWithPreAuthenticatedKeys(
    opts: LoginWithPreAuthenticatedKeysOpts,
  ): Promise<LoginWithPreAuthenticatedKeysResult> {
    const stack = getCurrentStack(1);
    this.validator.validateMethodParamOrThrow(
      "repository",
      "loginWithPreAuthenticatedKeys",
      "opts",
      loginWithPreAuthenticatedKeysOptsSchema,
      opts,
      stack,
    );
    const { keyId, publicKey, privateKey } = opts;
    const { userName } = await this.repositoryPort.callRpc(
      "loginWithPreAuthenticatedKeys",
      { keyId, publicKey, privateKey },
      { stack },
    );
    return { userName };
  }

  private readonly downloadPlanFinalizationRegistry = new FinalizationRegistry<{
    owner: string;
    name: string;
  }>(({ owner, name }) => {
    this.logger.warn(`
      A download plan for artifact ${owner}/${name} has been garbage collected without being
      disposed. Please make sure you are creating the download plan with the "using" keyword.

      This is a memory leak and needs to be fixed.
    `);
  });
  /**
   * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development. Stay
   * tuned for updates.
   */
  public createArtifactDownloadPlanner(
    opts: CreateArtifactDownloadPlannerOpts,
  ): ArtifactDownloadPlanner {
    const { owner, name, onPlanUpdated } = this.validator.validateMethodParamOrThrow(
      "repository",
      "createArtifactDownloadPlanner",
      "opts",
      createArtifactDownloadPlannerOptsSchema,
      opts,
    );
    const stack = getCurrentStack(1);
    const channel = this.repositoryPort.createChannel(
      "createArtifactDownloadPlan",
      { owner, name },
      undefined, // Don't listen to the messages yet.
      { stack },
    );
    const planner = new ArtifactDownloadPlanner(
      owner,
      name,
      onPlanUpdated,
      channel,
      this.validator,
      () => {
        this.downloadPlanFinalizationRegistry.unregister(planner);
      },
    );
    this.downloadPlanFinalizationRegistry.register(planner, { owner, name }, planner);
    return planner;
  }
}
