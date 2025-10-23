import {
  apiServerPorts,
  getCurrentStack,
  makePrettyError,
  SimpleLogger,
  text,
  Validator,
  type LoggerInterface,
} from "@lmstudio/lms-common";
import {
  type BackendInterface,
  type ChannelEndpointsSpecBase,
  type RpcEndpointsSpecBase,
  type SignalEndpointsSpecBase,
  type WritableSignalEndpointsSpecBase,
} from "@lmstudio/lms-communication";
import { getHostedEnv, type ClientPort } from "@lmstudio/lms-communication-client";
import {
  createDiagnosticsBackendInterface,
  createEmbeddingBackendInterface,
  createFilesBackendInterface,
  createLlmBackendInterface,
  createPluginsBackendInterface,
  createRepositoryBackendInterface,
  createRuntimeBackendInterface,
  createSystemBackendInterface,
  type DiagnosticsPort,
  type EmbeddingPort,
  type FilesPort,
  type LLMPort,
  type PluginsPort,
  type RepositoryPort,
  type RuntimePort,
  type SystemPort,
} from "@lmstudio/lms-external-backend-interfaces";
import { generateRandomBase64 } from "@lmstudio/lms-isomorphic";
import { lmstudioAPITokenRegex } from "@lmstudio/lms-shared-types";
import chalk from "chalk";
import process from "process";
import { z } from "zod";
import { createAuthenticatedClientPort } from "./createAuthenticatedClientPort.js";
import { DiagnosticsNamespace } from "./diagnostics/DiagnosticsNamespace.js";
import { EmbeddingNamespace } from "./embedding/EmbeddingNamespace.js";
import { FilesNamespace } from "./files/FilesNamespace.js";
import { friendlyErrorDeserializer } from "./friendlyErrorDeserializer.js";
import { LLMNamespace } from "./llm/LLMNamespace.js";
import { PluginsNamespace } from "./plugins/PluginsNamespace.js";
import { RepositoryNamespace } from "./repository/RepositoryNamespace.js";
import { RuntimeNamespace } from "./runtime/RuntimeNamespace.js";
import { SystemNamespace } from "./system/SystemNamespace.js";

/** @public */
export interface LMStudioClientConstructorOpts {
  /**
   * Changes the logger that is used by LMStudioClient internally. The default logger is `console`.
   * By default, LMStudioClient only logs warnings and errors that require user intervention. If the
   * `verbose` option is enabled while calling supporting methods, those messages will also be
   * directed to the specified logger.
   */
  logger?: LoggerInterface;
  /**
   * The base URL of the LM Studio server. If not provided, LM Studio will attempt to connect to the
   * localhost with various default ports.
   *
   * If you have set a custom port and/or are reverse-proxying, you should pass in the baseUrl.
   *
   * Since LM Studio uses WebSockets, the protocol must be "ws" or "wss".
   *
   * For example, if have changed the port to 8080, you should create the LMStudioClient like so:
   *
   * ```typescript
   * const client = new LMStudioClient({ baseUrl: "ws://127.0.0.1:8080" });
   * ```
   */
  baseUrl?: string;
  /**
   * Whether to include stack traces in the errors caused by LM Studio. By default, this is set to
   * `false`. If set to `true`, LM Studio SDK will include a stack trace in the error message.
   */
  verboseErrorMessages?: boolean;
  /**
   * The API token to access this LM Studio instance. This is not required unless LM Studio is
   * configured to mandate API tokens.
   *
   * API tokens are create within LM Studio.
   */
  apiToken?: string;
  /**
   * @deprecated Please use {@link apiToken} instead.
   *
   * Changes the client identifier used to authenticate with LM Studio. By default, it uses a
   * randomly generated string.
   *
   * If you wish to share resources across multiple LMStudioClient, you should set them to use the
   * same `clientIdentifier` and `clientPasskey`.
   */
  clientIdentifier?: string;
  /**
   * @deprecated Please use {@link apiToken} instead.
   *
   * Changes the client passkey used to authenticate with LM Studio. By default, it uses a randomly
   * generated string.
   *
   * If you wish to share resources across multiple LMStudioClient, you should set them to use the
   * same `clientIdentifier` and `clientPasskey`.
   */
  clientPasskey?: string;
}
const constructorOptsSchema = z
  .object({
    logger: z.any().optional(),
    baseUrl: z.string().optional(),
    verboseErrorMessages: z.boolean().optional(),
    apiToken: z.string().optional(),
    clientIdentifier: z.string().optional(),
    clientPasskey: z.string().optional(),

    // Internal testing options
    disableConnection: z.boolean().optional(),
    llmPort: z.any().optional(),
    embeddingPort: z.any().optional(),
    systemPort: z.any().optional(),
    diagnosticsPort: z.any().optional(),
    retrievalPort: z.any().optional(),
    filesPort: z.any().optional(),
    repositoryPort: z.any().optional(),
    pluginsPort: z.any().optional(),
    runtimePort: z.any().optional(),
  })
  .strict();

/** @public */
export class LMStudioClient {
  /** @internal */
  private readonly logger: SimpleLogger;

  public readonly clientIdentifier: string;
  /** @internal */
  private readonly clientPasskey: string;

  /** @internal */
  private readonly llmPort: LLMPort;
  /** @internal */
  private readonly embeddingPort: EmbeddingPort;
  /** @internal */
  private readonly systemPort: SystemPort;
  /** @internal */
  private readonly diagnosticsPort: DiagnosticsPort;
  /** @internal */
  private readonly filesPort: FilesPort;
  /** @internal */
  private readonly repositoryPort: RepositoryPort;
  /** @internal */
  private readonly pluginsPort: PluginsPort;
  /** @internal */
  private readonly runtimePort: RuntimePort;

  public readonly llm: LLMNamespace;
  public readonly embedding: EmbeddingNamespace;
  public readonly system: SystemNamespace;
  public readonly diagnostics: DiagnosticsNamespace;
  public readonly files: FilesNamespace;
  public readonly repository: RepositoryNamespace;
  /**
   * @experimental [EXP-PLUGIN-CORE] Plugin support is still in development. This may change in the
   * future without warning.
   */
  public readonly plugins: PluginsNamespace;
  public readonly runtime: RuntimeNamespace;

  /** @internal */
  private validateBaseUrlOrThrow(baseUrl: string) {
    let url: URL;
    try {
      url = new URL(baseUrl);
    } catch (e) {
      this.logger.throw(text`
        Failed to construct LMStudioClient. The baseUrl passed in is invalid. Received: ${baseUrl}
      `);
    }
    if (!["ws:", "wss:"].includes(url.protocol)) {
      this.logger.throw(text`
        Failed to construct LMStudioClient. The baseUrl passed in must have protocol "ws" or "wss".
        Received: ${baseUrl}
      `);
    }
    if (url.search !== "") {
      this.logger.throw(text`
        Failed to construct LMStudioClient. The baseUrl passed contains search parameters
        ("${url.search}").
      `);
    }
    if (url.hash !== "") {
      this.logger.throw(text`
        Failed to construct LMStudioClient. The baseUrl passed contains a hash ("${url.hash}").
      `);
    }
    if (url.username !== "" || url.password !== "") {
      this.logger.throw(text`
        Failed to construct LMStudioClient. The baseUrl passed contains a username or password. We
        do not support these in the baseUrl. Received: ${baseUrl}
      `);
    }
    if (baseUrl.endsWith("/")) {
      this.logger.throw(text`
        Failed to construct LMStudioClient. The baseUrl passed in must not end with a "/". If you
        are reverse-proxying, you should remove the trailing slash from the baseUrl. Received:
        ${baseUrl}
      `);
    }
  }

  private async isLocalhostWithGivenPortLMStudioServer(port: number): Promise<number> {
    const response = await fetch(`http://127.0.0.1:${port}/lmstudio-greeting`);
    if (response.status !== 200) {
      throw new Error("Status is not 200.");
    }
    const json = await response.json();
    if (json?.lmstudio !== true) {
      throw new Error("Not an LM Studio server.");
    }
    return port;
  }

  /**
   * Guess the base URL of the LM Studio server by visiting localhost on various default ports.
   */
  private async guessBaseUrl(stack?: string): Promise<string> {
    if (getHostedEnv() !== null) {
      return Promise.resolve("Using hosted env");
    }
    // On browser, those apiServerPorts are not accessible anyway. We will just try to see if we can
    // reach the server on 127.0.0.1:1234 (the default port).
    if ((process as any).browser) {
      try {
        this.isLocalhostWithGivenPortLMStudioServer(1234);
        return "ws://127.0.0.1:1234";
      } catch (error) {
        text`
          ${chalk.redBright("Failed to connect to LM Studio.")}

          Is LM Studio running? If not, please start it by running:

              ${chalk.yellow("lms server start --cors")}

          If you are attempting to connect to LM Studio on a separate machine, please provide the
          baseUrl option when creating the LMStudioClient:

              ${chalk.blueBright(text`
                const client = new LMStudioClient({ baseUrl: 'ws://<host_name>:<port>' });
              `)}

          ${chalk.white("(i) For more information, refer to the LM Studio documentation:")}

              ${chalk.gray("https://lmstudio.ai/docs/local-server")}
        `;
      }
    }
    return Promise.any(apiServerPorts.map(this.isLocalhostWithGivenPortLMStudioServer)).then(
      port => `ws://127.0.0.1:${port}`,
      () => {
        throw makePrettyError(
          text`
            ${chalk.redBright("Failed to connect to LM Studio.")}

            Please make sure LM Studio is running on your machine.

            If you are attempting to connect to LM Studio on a separate machine, please provide the
            baseUrl option when creating the LMStudioClient:

                ${chalk.blueBright(text`
                  const client = new LMStudioClient({ baseUrl: 'ws://<host_name>:<port>' });
                `)}

            ${chalk.white("(i) For more information, refer to the LM Studio documentation:")}

                ${chalk.gray("https://lmstudio.ai/docs/local-server")}
          `,
          stack,
        );
      },
    );
  }

  private createPort<
    TRpcEndpoints extends RpcEndpointsSpecBase,
    TChannelEndpoints extends ChannelEndpointsSpecBase,
    TSignalEndpoints extends SignalEndpointsSpecBase,
    TWritableSignalEndpoints extends WritableSignalEndpointsSpecBase,
  >(
    namespace: string,
    name: string,
    backendInterface: BackendInterface<
      never,
      TRpcEndpoints,
      TChannelEndpoints,
      TSignalEndpoints,
      TWritableSignalEndpoints
    >,
  ): ClientPort<TRpcEndpoints, TChannelEndpoints, TSignalEndpoints, TWritableSignalEndpoints> {
    return createAuthenticatedClientPort(
      backendInterface,
      this.resolvingBaseUrl,
      namespace,
      this.clientIdentifier,
      this.clientPasskey,
      new SimpleLogger(name, this.logger),
      {
        errorDeserializer: friendlyErrorDeserializer,
        verboseErrorMessage: this.verboseErrorMessages,
      },
    );
  }

  private resolvingBaseUrl: string | Promise<string>;
  private verboseErrorMessages: boolean;

  public constructor(opts: LMStudioClientConstructorOpts = {}) {
    const {
      logger,
      baseUrl,
      verboseErrorMessages,
      apiToken,
      clientIdentifier: clientIdentifierInput,
      clientPasskey: clientPasskeyInput,
      disableConnection,
      llmPort,
      embeddingPort,
      systemPort,
      diagnosticsPort,
      retrievalPort,
      filesPort,
      repositoryPort,
      pluginsPort,
      runtimePort,
    } = new Validator().validateConstructorParamOrThrow(
      "LMStudioClient",
      "opts",
      constructorOptsSchema,
      opts,
    ) satisfies LMStudioClientConstructorOpts;

    if ((globalThis as any).__LMS_PLUGIN_CONTEXT && opts.baseUrl === undefined) {
      throw new Error(
        text`
          You cannot create a local LMStudioClient in a plugin context. To use LM Studio APIs, use
          the "client" property attached to the Controllers.

          For example, instead of:

          ${
            "const client = new LMStudioClient(); // <-- Error\n" +
            "export async function generate(ctl: GeneratorController) {\n" +
            "  const model = await client.llm.model(...);\n" +
            "}"
          }

          Do this:

          ${
            "export async function generate(ctl: GeneratorController) {\n" +
            "  const model = await ctl.client.llm.model(...);\n" +
            "}"
          }

          If you need to connect to a remote LM Studio, you should pass in the \`baseUrl\` option to
          the LMStudioClient constructor:

          ${"const client = new LMStudioClient({ baseUrl: 'ws://<host_name>:<port>' });"}
        `,
      );
    }

    let clientIdentifier = clientIdentifierInput;
    let clientPasskey = clientPasskeyInput;

    if (apiToken !== undefined && (clientIdentifier !== undefined || clientPasskey !== undefined)) {
      throw new Error(text`
        You cannot pass both apiToken and clientIdentifier/clientPasskey. clientIdentifier and
        clientPasskey are legacy authentication methods and have been replaced by apiToken.
      `);
    }

    if (apiToken !== undefined) {
      const match = apiToken.match(lmstudioAPITokenRegex);
      if (match === null) {
        throw new Error(text`
          The apiToken you passed in when constructing the LMStudioClient does not look like a valid
          LM Studio API token.

          LM Studio API tokens are obtained from LM Studio, and they look like this:
          sk-lm-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx.
        `);
      }
      if (match.groups === undefined) {
        throw new Error("Unexpected - match.groups is undefined.");
      }
      clientIdentifier = match.groups.clientIdentifier;
      clientPasskey = match.groups.clientPasskey;
    } else if (clientIdentifier !== undefined || clientPasskey !== undefined) {
      // Use provided legacy clientIdentifier/clientPasskey as-is (precedence over env var)
    } else if (process.env.LM_API_TOKEN !== undefined && process.env.LM_API_TOKEN !== "") {
      const match = process.env.LM_API_TOKEN.match(lmstudioAPITokenRegex);
      if (match === null) {
        throw new Error(text`
          The LM_API_TOKEN environment variable does not look like a valid LM Studio API
          token.

          LM Studio API tokens are obtained from LM Studio, and they look like this:
          sk-lm-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx.
        `);
      }
      if (match.groups === undefined) {
        throw new Error("Unexpected - match.groups is undefined.");
      }
      clientIdentifier = match.groups.clientIdentifier;
      clientPasskey = match.groups.clientPasskey;
    }

    this.logger = new SimpleLogger("LMStudioClient", logger);
    this.clientIdentifier = clientIdentifier ?? `guest:${generateRandomBase64(18)}`;
    this.clientPasskey = clientPasskey ?? generateRandomBase64(18);

    const stack = getCurrentStack(1);
    if (disableConnection) {
      this.resolvingBaseUrl = new Promise(() => undefined);
    } else {
      if (baseUrl === undefined) {
        this.resolvingBaseUrl = this.guessBaseUrl(verboseErrorMessages ? stack : undefined);
      } else {
        this.validateBaseUrlOrThrow(baseUrl);
        this.resolvingBaseUrl = baseUrl;
      }
    }
    this.verboseErrorMessages = verboseErrorMessages ?? true;

    this.llmPort = llmPort ?? this.createPort("llm", "LLM", createLlmBackendInterface());
    this.embeddingPort =
      embeddingPort ?? this.createPort("embedding", "Embedding", createEmbeddingBackendInterface());
    this.systemPort =
      systemPort ?? this.createPort("system", "System", createSystemBackendInterface());
    this.diagnosticsPort =
      diagnosticsPort ??
      this.createPort("diagnostics", "Diagnostics", createDiagnosticsBackendInterface());
    this.filesPort = filesPort ?? this.createPort("files", "Files", createFilesBackendInterface());
    this.repositoryPort =
      repositoryPort ??
      this.createPort("repository", "Repository", createRepositoryBackendInterface());
    this.pluginsPort =
      pluginsPort ?? this.createPort("plugins", "Plugins", createPluginsBackendInterface());
    this.runtimePort =
      runtimePort ?? this.createPort("runtime", "Runtime", createRuntimeBackendInterface());

    const validator = new Validator();

    this.llm = new LLMNamespace(
      this,
      this.llmPort,
      new SimpleLogger("LLM", this.logger),
      validator,
    );
    this.embedding = new EmbeddingNamespace(
      this,
      this.embeddingPort,
      new SimpleLogger("Embedding", this.logger),
      validator,
    );
    this.system = new SystemNamespace(this.systemPort, validator, this.logger);
    this.diagnostics = new DiagnosticsNamespace(this.diagnosticsPort, validator, this.logger);
    this.files = new FilesNamespace(this.filesPort, validator, this.logger);
    this.repository = new RepositoryNamespace(this.repositoryPort, validator, this.logger);
    this.plugins = new PluginsNamespace(this.pluginsPort, this, validator, this.logger, logger);
    this.runtime = new RuntimeNamespace(this.runtimePort, validator, this.logger);
  }

  public async [Symbol.asyncDispose]() {
    await Promise.all([
      this.llmPort[Symbol.asyncDispose](),
      this.embeddingPort[Symbol.asyncDispose](),
      this.systemPort[Symbol.asyncDispose](),
      this.diagnosticsPort[Symbol.asyncDispose](),
      this.filesPort[Symbol.asyncDispose](),
      this.repositoryPort[Symbol.asyncDispose](),
      this.pluginsPort[Symbol.asyncDispose](),
      this.runtimePort[Symbol.asyncDispose](),
    ]);
  }
}
