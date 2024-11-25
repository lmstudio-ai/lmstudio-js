import { getCurrentStack, SimpleLogger, type Validator } from "@lmstudio/lms-common";
import { type EmbeddingPort } from "@lmstudio/lms-external-backend-interfaces";
import {
  embeddingSharedLoadConfigSchematics,
  globalConfigSchematics,
} from "@lmstudio/lms-kv-config";
import { type ModelSpecifier } from "@lmstudio/lms-shared-types";
import { z } from "zod";
import { DynamicHandle } from "../modelShared/DynamicHandle.js";

/**
 * This represents a set of requirements for a model. It is not tied to a specific model, but rather
 * to a set of requirements that a model must satisfy.
 *
 * For example, if you got the model via `client.embedding.get("my-identifier")`, you will get a
 * `EmbeddingModel` for the model with the identifier `my-identifier`. If the model is unloaded, and
 * another model is loaded with the same identifier, using the same `EmbeddingModel` will use the
 * new model.
 *
 * @public
 */
export class EmbeddingDynamicHandle extends DynamicHandle<// prettier-ignore
/** @internal */ EmbeddingPort> {
  /**
   * Don't construct this on your own. Use {@link EmbeddingNamespace#get} or
   * {@link EmbeddingNamespace#load}
   * instead.
   *
   * @internal
   */
  public constructor(
    /** @internal */
    port: EmbeddingPort,
    /** @internal */
    specifier: ModelSpecifier,
    /** @internal */
    private readonly validator: Validator,
    /** @internal */
    private readonly logger: SimpleLogger = new SimpleLogger(`EmbeddingModel`),
  ) {
    super(port, specifier);
  }

  public async embedString(inputString: string) {
    const stack = getCurrentStack(1);
    inputString = this.validator.validateMethodParamOrThrow(
      "client.embedding",
      "embedString",
      "inputString",
      z.string(),
      inputString,
      stack,
    );
    return await this.port.callRpc(
      "embedString",
      { inputString, modelSpecifier: this.specifier },
      { stack },
    );
  }

  public async unstable_getContextLength(): Promise<number> {
    const stack = getCurrentStack(1);
    const loadConfig = await this.getLoadConfig(stack);
    return embeddingSharedLoadConfigSchematics.access(loadConfig, "contextLength");
  }

  public async unstable_getEvalBatchSize(): Promise<number> {
    const stack = getCurrentStack(1);
    const loadConfig = await this.getLoadConfig(stack);
    return globalConfigSchematics.access(loadConfig, "embedding.load.llama.evalBatchSize");
  }

  public async unstable_tokenize(inputString: string): Promise<number[]> {
    const stack = getCurrentStack(1);
    inputString = this.validator.validateMethodParamOrThrow(
      "model",
      "unstable_tokenize",
      "inputString",
      z.string(),
      inputString,
      stack,
    );
    return (
      await this.port.callRpc(
        "tokenize",
        {
          specifier: this.specifier,
          inputString,
        },
        { stack },
      )
    ).tokens;
  }
}
