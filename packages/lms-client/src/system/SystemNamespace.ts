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

/** @public */
export class SystemNamespace {
  /** @internal */
  private readonly logger: SimpleLogger;
  // Step 5b: Add member here for system.unstable
  public readonly unstable: UnstableSystemNamespace;
  /** @internal */
  public constructor(
    private readonly systemPort: SystemPort,
    private readonly validator: Validator,
    parentLogger: LoggerInterface,
  ) {
    this.logger = new SimpleLogger("System", parentLogger);
    // Step 5c: Instantiate unstable "namespace" here
    this.unstable = new UnstableSystemNamespace(systemPort, validator, parentLogger);
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

  // Step 4. Implement code that calls the new endpoint from the client
  /**
   * Select an engine to use for LM Studio. This is an unstable API and may change without notice.
   *
   * Can use 'unstable_' prefix as even another way to communicate instability.
   *
   * @experimental [QUALIFIER] Details
   * @deprecated [QUALIFIER] Details
   */
  public async unstable_setEngine(name: string, version: string) {
    // need to call getCurrentStack to get 1 level above the current stack, so points to setEngine
    const stack = getCurrentStack(1);
    // do this to give nice error messages if the params are wrong
    [name, version] = this.validator.validateMethodParamsOrThrow(
      "client.system",
      "setEngine",
      ["name", "version"],
      [z.string(), z.string()],
      [name, version],
      stack,
    );
    await this.systemPort.callRpc("setEngine", { engineSpecifier: { name, version } }, { stack });
  }
}

// Step 5a: if you want to make an system.unstable "namepace", create this calls and add to
// SystemNamespace as a public member. Must still export the types in index.ts and expotedTypes.ts
export class UnstableSystemNamespace {
  /** @internal */
  private readonly logger: SimpleLogger;
  /** @internal */
  public constructor(
    private readonly systemPort: SystemPort,
    private readonly validator: Validator,
    parentLogger: LoggerInterface,
  ) {
    this.logger = new SimpleLogger("UnstableSystem", parentLogger);
  }
}
