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
  type AuthenticationStatus,
  type DownloadProgressUpdate,
  type LocalArtifactFileList,
  modelCompatibilityTypeSchema,
  type ModelCompatibilityType,
  type ModelDownloadSource,
  modelDownloadSourceSchema,
  type ModelSearchOpts,
} from "@lmstudio/lms-shared-types";
import { z, type ZodSchema } from "zod";
import {
  ArtifactDownloadPlanner,
  type ArtifactDownloadPlannerChannel,
} from "./ArtifactDownloadPlanner.js";
import { ModelSearchResultEntry } from "./ModelSearchResultEntry.js";
import { RepositoryLMLinkNamespace } from "./RepositoryLMLinkNamespace.js";

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
  onAuthenticationCode: (opts: {
    /**
     * The code to enter.
     */
    code: string;
    /**
     * The URL for user to manually enter the code.
     */
    manualUrl: string;
    /**
     * The URL that will be automatically filled.
     */
    filledUrl: string;
  }) => void;
}
export const ensureAuthenticatedOptsSchema = z.object({
  onAuthenticationCode: z.function(),
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

export type RepositoryDownloadPlannerResolutionPreference =
  | {
      type: "fileName";
      fileName: string;
    }
  | {
      type: "quantName";
      quantName: string;
    };
const repositoryDownloadPlannerResolutionPreferenceSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("fileName"),
    fileName: z.string(),
  }),
  z.object({
    type: z.literal("quantName"),
    quantName: z.string(),
  }),
]);

export interface RepositoryDownloadPlannerOpts {
  resolutionPreference?: Array<RepositoryDownloadPlannerResolutionPreference>;
  compatibilityTypes?: Array<ModelCompatibilityType>;
}
const repositoryDownloadPlannerOptsSchema = z.object({
  resolutionPreference: z.array(repositoryDownloadPlannerResolutionPreferenceSchema).optional(),
  compatibilityTypes: z.array(modelCompatibilityTypeSchema).optional(),
});

type RepositoryDownloadPlannerTarget =
  | {
      type: "artifact";
      owner: string;
      name: string;
    }
  | {
      type: "model";
      source: ModelDownloadSource;
    };

/**
 * Options to use with {@link RepositoryNamespace#createArtifactDownloadPlanner}.
 *
 * @public
 */
export interface CreateArtifactDownloadPlannerOpts extends RepositoryDownloadPlannerOpts {
  owner: string;
  name: string;
  onPlanUpdated?: (plan: ArtifactDownloadPlan) => void;
  signal?: AbortSignal;
}
export const createArtifactDownloadPlannerOptsSchema = repositoryDownloadPlannerOptsSchema.extend({
  owner: z.string(),
  name: z.string(),
  onPlanUpdated: z.function().optional(),
  signal: z.instanceof(AbortSignal).optional(),
}) as ZodSchema<CreateArtifactDownloadPlannerOpts>;

/**
 * Options to use with {@link RepositoryNamespace#createModelDownloadPlanner}.
 *
 * @public
 */
export interface CreateModelDownloadPlannerOpts extends RepositoryDownloadPlannerOpts {
  source: ModelDownloadSource;
  onPlanUpdated?: (plan: ArtifactDownloadPlan) => void;
  signal?: AbortSignal;
}
export const createModelDownloadPlannerOptsSchema = repositoryDownloadPlannerOptsSchema.extend({
  source: modelDownloadSourceSchema,
  onPlanUpdated: z.function().optional(),
  signal: z.instanceof(AbortSignal).optional(),
}) as ZodSchema<CreateModelDownloadPlannerOpts>;

/** @public */
export interface FuzzyFindStaffPicksOpts {
  searchTerm?: string;
  limit?: number;
}
const fuzzyFindStaffPicksOptsSchema = z.object({
  searchTerm: z.string().optional(),
  limit: z.number().int().positive().optional(),
}) as ZodSchema<FuzzyFindStaffPicksOpts>;

/** @public */
export interface FuzzyFindStaffPickResult {
  owner: string;
  name: string;
  revisionNumber: number;
  createdAtTimestamp: number;
  description: string;
  exact: boolean;
}

interface RepositoryPortWithPlannerMethods {
  createChannel(
    endpoint: "createDownloadPlan",
    creationParameter: {
      target: RepositoryDownloadPlannerTarget;
      opts?: RepositoryDownloadPlannerOpts;
    },
    messageHandler: undefined,
    opts: {
      stack?: string;
    },
  ): ArtifactDownloadPlannerChannel;
  callRpc(
    endpoint: "fuzzyFindStaffPicks",
    parameter: FuzzyFindStaffPicksOpts,
    opts: {
      stack?: string;
    },
  ): Promise<{
    results: Array<FuzzyFindStaffPickResult>;
  }>;
}

/**
 * Options to use with {@link RepositoryNamespace#installLocalPlugin}.
 *
 * @public
 */
export interface InstallLocalPluginOpts {
  path: string;
}
const installLocalPluginOptsSchema = z.object({
  path: z.string(),
}) as ZodSchema<InstallLocalPluginOpts>;

/** @public */
export class RepositoryNamespace {
  /** @internal */
  private readonly logger: SimpleLogger;
  /**
   * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development
   * and will change. Not recommended for public adoption.
   */
  public readonly unstable: UnstableRepositoryNamespace;
  /**
   * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development
   * and will change. Not recommended for public adoption.
   */
  public readonly lmLink: RepositoryLMLinkNamespace;
  /** @internal */
  public constructor(
    private readonly repositoryPort: RepositoryPort,
    private readonly validator: Validator,
    parentLogger: LoggerInterface,
  ) {
    this.logger = new SimpleLogger("Repository", parentLogger);
    this.unstable = new UnstableRepositoryNamespace(repositoryPort, this.logger);
    this.lmLink = new RepositoryLMLinkNamespace(repositoryPort, this.logger);
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
        case "authenticationCode": {
          safeCallCallback(this.logger, "onAuthenticationCode", opts.onAuthenticationCode, [
            {
              code: message.code,
              manualUrl: message.manualUrl,
              filledUrl: message.filledUrl,
            },
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

  /**
   * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development. Stay
   * tuned for updates.
   */
  public async getAuthenticationStatus(): Promise<AuthenticationStatus | null> {
    const stack = getCurrentStack(1);
    const { authenticationStatus } = await this.repositoryPort.callRpc(
      "getAuthenticationStatus",
      undefined,
      { stack },
    );
    return authenticationStatus;
  }

  /**
   * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development. Stay
   * tuned for updates.
   */
  public async deauthenticate(): Promise<void> {
    const stack = getCurrentStack(1);
    await this.repositoryPort.callRpc("deauthenticate", undefined, { stack });
  }

  /**
   * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development. Stay
   * tuned for updates.
   */
  public async isAuthenticated(): Promise<boolean> {
    const stack = getCurrentStack(1);
    const { authenticated } = await this.repositoryPort.callRpc("isAuthenticated", undefined, {
      stack,
    });
    return authenticated;
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

  private readonly downloadPlanFinalizationRegistry = new FinalizationRegistry<string>(
    plannerDescription => {
      this.logger.warn(`
      A download plan for ${plannerDescription} has been garbage collected without being
      disposed. Please make sure you are creating the download plan with the "using" keyword.

      This is a memory leak and needs to be fixed.
    `);
    },
  );
  /**
   * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development. Stay
   * tuned for updates.
   */
  public createArtifactDownloadPlanner(
    opts: CreateArtifactDownloadPlannerOpts,
  ): ArtifactDownloadPlanner {
    const { owner, name, onPlanUpdated, signal } = this.validator.validateMethodParamOrThrow(
      "repository",
      "createArtifactDownloadPlanner",
      "opts",
      createArtifactDownloadPlannerOptsSchema,
      opts,
    );
    const initialPlan: ArtifactDownloadPlan = {
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
      downloadAction: "none",
      version: 0,
    };
    const stack = getCurrentStack(1);
    const repositoryPort = this.repositoryPort as RepositoryPort & RepositoryPortWithPlannerMethods;
    const channel = repositoryPort.createChannel(
      "createDownloadPlan",
      {
        target: {
          type: "artifact",
          owner,
          name,
        },
        opts: {
          resolutionPreference: opts.resolutionPreference,
          compatibilityTypes: opts.compatibilityTypes,
        },
      },
      undefined, // Don't listen to the messages yet.
      { stack },
    );
    const planner = new ArtifactDownloadPlanner(
      `${owner}/${name}`,
      initialPlan,
      onPlanUpdated,
      channel,
      this.validator,
      () => {
        this.downloadPlanFinalizationRegistry.unregister(planner);
      },
      signal,
    );
    this.downloadPlanFinalizationRegistry.register(planner, `${owner}/${name}`, planner);
    return planner;
  }

  /**
   * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development. Stay
   * tuned for updates.
   */
  public createModelDownloadPlanner(opts: CreateModelDownloadPlannerOpts): ArtifactDownloadPlanner {
    const { source, onPlanUpdated, signal } = this.validator.validateMethodParamOrThrow(
      "repository",
      "createModelDownloadPlanner",
      "opts",
      createModelDownloadPlannerOptsSchema,
      opts,
    );
    const plannerDescription = `${source.user}/${source.repo}`;
    const initialPlan: ArtifactDownloadPlan = {
      nodes: [
        {
          type: "model",
          state: "pending",
          dependencyLabel: plannerDescription,
        },
      ],
      downloadSizeBytes: 0,
      downloadAction: "none",
      version: 0,
    };
    const stack = getCurrentStack(1);
    const repositoryPort = this.repositoryPort as RepositoryPort & RepositoryPortWithPlannerMethods;
    const channel = repositoryPort.createChannel(
      "createDownloadPlan",
      {
        target: {
          type: "model",
          source,
        },
        opts: {
          resolutionPreference: opts.resolutionPreference,
          compatibilityTypes: opts.compatibilityTypes,
        },
      },
      undefined,
      { stack },
    );
    const planner = new ArtifactDownloadPlanner(
      plannerDescription,
      initialPlan,
      onPlanUpdated,
      channel,
      this.validator,
      () => {
        this.downloadPlanFinalizationRegistry.unregister(planner);
      },
      signal,
    );
    this.downloadPlanFinalizationRegistry.register(planner, plannerDescription, planner);
    return planner;
  }

  /**
   * Install a plugin that exists in a local folder. It will be installed as if it is downloaded
   * from the LM Studio Hub.
   *
   * The folder must contain a valid plugin manifest file (`manifest.json`).
   *
   * @experimental [EXP-INSTALL-LOCAL] This function may change in the future.
   */
  public installLocalPlugin(opts: InstallLocalPluginOpts): Promise<void> {
    const stack = getCurrentStack(1);
    const { path } = this.validator.validateMethodParamOrThrow(
      "repository",
      "installLocalPlugin",
      "opts",
      installLocalPluginOptsSchema,
      opts,
      stack,
    );
    return this.repositoryPort.callRpc("installLocalPlugin", { pluginPath: path }, { stack });
  }
}

/**
 * Access to LM Studio Hub APIs that are still in flux.
 *
 * @public
 * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development
 * and will change. Not recommended for public adoption.
 */
export class UnstableRepositoryNamespace {
  /** @internal */
  private readonly logger: SimpleLogger;
  /** @internal */
  public constructor(
    private readonly repositoryPort: RepositoryPort,
    parentLogger: LoggerInterface,
  ) {
    this.logger = new SimpleLogger("Unstable", parentLogger);
  }

  /**
   * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development
   * and will change. Not recommended for public adoption.
   */
  public async getModelCatalog() {
    const stack = getCurrentStack(1);
    return (await this.repositoryPort.callRpc("getModelCatalog", undefined, { stack })).models;
  }

  /**
   * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development
   * and will change. Not recommended for public adoption.
   */
  public async fuzzyFindStaffPicks(
    opts: FuzzyFindStaffPicksOpts = {},
  ): Promise<Array<FuzzyFindStaffPickResult>> {
    const stack = getCurrentStack(1);
    const normalizedOpts = fuzzyFindStaffPicksOptsSchema.parse(opts);
    const repositoryPort = this.repositoryPort as RepositoryPort & RepositoryPortWithPlannerMethods;
    return (await repositoryPort.callRpc("fuzzyFindStaffPicks", normalizedOpts, { stack })).results;
  }
}
