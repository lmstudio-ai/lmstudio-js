import {
  getCurrentStack,
  makePromise,
  SimpleLogger,
  type LoggerInterface,
  type Validator,
} from "@lmstudio/lms-common";
import { type SystemPort } from "@lmstudio/lms-external-backend-interfaces";
import {
  backendNotificationSchema,
  type BackendNotification,
  type EmbeddingModelInfo,
  type LLMInfo,
  type ModelInfo,
} from "@lmstudio/lms-shared-types";
import { z } from "zod";

const startHttpServerOptsSchema = z.object({
  port: z
    .number()
    .int()
    .min(1)
    .max(65535)
    .describe("Port to run the API server on. Must be between 1 and 65535."),
  cors: z
    .boolean()
    .describe("Enable CORS on the API server. Allows any website to access the server."),
});

type StartHttpServerOpts = z.infer<typeof startHttpServerOptsSchema>;

/** @public */
export class SystemNamespace {
  /** @internal */
  private readonly logger: SimpleLogger;
  /** @internal */
  public constructor(
    private readonly systemPort: SystemPort,
    private readonly validator: Validator,
    parentLogger: LoggerInterface,
  ) {
    this.logger = new SimpleLogger("System", parentLogger);
  }
  /**
   * List all downloaded models.
   * @public
   */
  public async listDownloadedModels(): Promise<Array<ModelInfo>>;
  public async listDownloadedModels(domain: "llm"): Promise<Array<LLMInfo>>;
  public async listDownloadedModels(domain: "embedding"): Promise<Array<EmbeddingModelInfo>>;
  public async listDownloadedModels(domain?: "llm" | "embedding"): Promise<Array<ModelInfo>> {
    const stack = getCurrentStack(1);
    domain = this.validator.validateMethodParamOrThrow(
      "client.system",
      "listDownloadedModels",
      "domain",
      z.union([z.literal("llm"), z.literal("embedding"), z.undefined()]),
      domain,
      stack,
    );
    const models = await this.systemPort.callRpc("listDownloadedModels", undefined, {
      stack: getCurrentStack(1),
    });
    if (domain === undefined) {
      return models;
    }
    return models.filter(model => model.type === domain);
  }

  /**
   * A model can have multiple variants (e.g. different quantization, or different format). This
   * method returns detailed info about all the variants of the given modelKey.
   *
   * If the modelKey does not have any variants, will throw.
   */
  public async listDownloadedModelVariants(modelKey: string): Promise<Array<ModelInfo>> {
    const stack = getCurrentStack(1);
    modelKey = this.validator.validateMethodParamOrThrow(
      "client.system",
      "listDownloadedModelVariants",
      "modelKey",
      z.string(),
      modelKey,
      stack,
    );
    const variants = await this.systemPort.callRpc(
      "listDownloadedModelVariants",
      { modelKey },
      { stack },
    );
    return variants;
  }

  public async whenDisconnected(): Promise<void> {
    const stack = getCurrentStack(1);
    const channel = this.systemPort.createChannel("alive", undefined, undefined, { stack });
    const { promise, resolve } = makePromise();
    channel.onError.subscribeOnce(resolve);
    channel.onClose.subscribeOnce(resolve);
    await promise;
  }
  public async notify(notification: BackendNotification) {
    const stack = getCurrentStack(1);
    notification = this.validator.validateMethodParamOrThrow(
      "client.system",
      "notify",
      "notification",
      backendNotificationSchema,
      notification,
      stack,
    );

    await this.systemPort.callRpc("notify", notification, { stack });
  }
  public async getLMStudioVersion(): Promise<{ version: string; build: number }> {
    const stack = getCurrentStack(1);
    return await this.systemPort.callRpc("version", undefined, { stack });
  }

  /**
   * Sets an experiment flags for LM Studio. This is an unstable API and may change without notice.
   *
   * @experimental
   */
  public async unstable_setExperimentFlag(flag: string, value: boolean) {
    const stack = getCurrentStack(1);
    [flag, value] = this.validator.validateMethodParamsOrThrow(
      "client.system",
      "setExperimentFlag",
      ["flag", "value"],
      [z.string(), z.boolean()],
      [flag, value],
      stack,
    );
    await this.systemPort.callRpc("setExperimentFlag", { code: flag, value }, { stack });
  }

  /**
   * Gets all experiment flags for LM Studio. This is an unstable API and may change without notice.
   *
   * @experimental
   */
  public async unstable_getExperimentFlags(): Promise<Array<string>> {
    const stack = getCurrentStack(1);
    return await this.systemPort.callRpc("getExperimentFlags", undefined, { stack });
  }

  /**
   * Starts the API server on the specified port.
   *
   * @experimental
   */
  public async startHttpServer(opts: StartHttpServerOpts) {
    const stack = getCurrentStack(1);

    opts = this.validator.validateMethodParamOrThrow(
      "client.system",
      "startHttpServer",
      "args",
      startHttpServerOptsSchema,
      opts,
    );

    return await this.systemPort.callRpc(
      "startHttpServer",
      { port: opts.port, cors: opts.cors },
      {
        stack,
      },
    );
  }

  /**
   * Stops the API server if it is running.
   *
   * @experimental
   */
  public async stopHttpServer() {
    const stack = getCurrentStack(1);
    return await this.systemPort.callRpc("stopHttpServer", undefined, { stack });
  }

  /**
   * Get process information including PID and daemon status.
   */
  public async getInfo(): Promise<{ pid: number; isDaemon: boolean }> {
    const stack = getCurrentStack(1);
    return await this.systemPort.callRpc("info", undefined, { stack });
  }
}
