import { getCurrentStack } from "@lmstudio/lms-common";
import { type BaseModelPort } from "@lmstudio/lms-external-backend-interfaces";
import {
  type ModelProcessingState,
  type KVConfig,
  type ModelInfoBase,
  type ModelInstanceInfoBase,
  type ModelSpecifier,
} from "@lmstudio/lms-shared-types";

/**
 * This represents a set of requirements for a model. It is not tied to a specific model, but rather
 * to a set of requirements that a model must satisfy.
 *
 * For example, if you got the model via `client.llm.get("my-identifier")`, you will get a
 * `LLMModel` for the model with the identifier `my-identifier`. If the model is unloaded, and
 * another model is loaded with the same identifier, using the same `LLMModel` will use the new
 * model.
 *
 * @public
 */
export abstract class DynamicHandle<
  /** @internal */
  TClientPort extends BaseModelPort<TModelInstanceInfo, ModelInfoBase>,
  TModelInstanceInfo extends ModelInstanceInfoBase,
> {
  /**
   * Don't construct this on your own. Use {@link LLMNamespace#get} or {@link LLMNamespace#load}
   * instead.
   *
   * @internal
   */
  public constructor(
    /** @internal */
    protected readonly port: TClientPort,
    /** @internal */
    protected readonly specifier: ModelSpecifier,
  ) {}

  /**
   * Gets the information of the model that is currently associated with this `DynamicHandle`. If no
   * model is currently associated, this will return `undefined`.
   *
   * Note: As models are loaded/unloaded, the model associated with this `LLMModel` may change at
   * any moment.
   */
  public async getModelInfo(): Promise<TModelInstanceInfo | undefined> {
    const info = await this.port.callRpc(
      "getModelInfo",
      { specifier: this.specifier, throwIfNotFound: false },
      { stack: getCurrentStack(1) },
    );
    if (info === undefined) {
      return undefined;
    }
    return info;
  }

  protected async getLoadConfig(stack: string): Promise<KVConfig> {
    const loadConfig = await this.port.callRpc(
      "getLoadConfig",
      { specifier: this.specifier },
      { stack },
    );
    return loadConfig;
  }

  /**
   * Gets the current processing state of the model instance associated with this `DynamicHandle`.
   * If no model is currently associated, this will throw an error.
   *
   * @experimental [EXP-MODEL-PROCESSING-STATE] Getting the processing state of a model instance is
   * experimental and may change in the future.
   */
  public async getInstanceProcessingState(): Promise<ModelProcessingState> {
    const state = await this.port.callRpc("getInstanceProcessingState", {
      specifier: this.specifier,
      throwIfNotFound: true,
    });
    return state;
  }
}
