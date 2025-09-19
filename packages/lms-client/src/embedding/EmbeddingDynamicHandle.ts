import { getCurrentStack, SimpleLogger, type Validator } from "@lmstudio/lms-common";
import { type EmbeddingPort } from "@lmstudio/lms-external-backend-interfaces";
import {
  embeddingSharedLoadConfigSchematics,
  globalConfigSchematics,
  kvConfigToEmbeddingLoadModelConfig,
} from "@lmstudio/lms-kv-config";
import {
  type EmbeddingLoadModelConfig,
  type EmbeddingModelInstanceInfo,
  type ModelSpecifier,
} from "@lmstudio/lms-shared-types";
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
export class EmbeddingDynamicHandle extends DynamicHandle<
  // prettier-ignore
  /** @internal */ EmbeddingPort,
  EmbeddingModelInstanceInfo
> {
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

  public async embed(inputString: string): Promise<{ embedding: Array<number> }>;
  public async embed(inputStrings: Array<string>): Promise<Array<{ embedding: Array<number> }>>;
  public async embed(
    inputString: string | Array<string>,
  ): Promise<{ embedding: Array<number> } | Array<{ embedding: Array<number> }>> {
    const stack = getCurrentStack(1);
    inputString = this.validator.validateMethodParamOrThrow(
      "client.embedding",
      "embed",
      "inputString",
      z.string().or(z.array(z.string())),
      inputString,
      stack,
    );
    if (Array.isArray(inputString)) {
      return await Promise.all(
        inputString.map(s =>
          this.port.callRpc(
            "embedString",
            { inputString: s, modelSpecifier: this.specifier },
            { stack },
          ),
        ),
      );
    } else {
      return await this.port.callRpc(
        "embedString",
        { inputString, modelSpecifier: this.specifier },
        { stack },
      );
    }
  }

  public async getContextLength(): Promise<number> {
    const stack = getCurrentStack(1);
    const loadConfig = await super.getLoadKVConfig(stack);
    return embeddingSharedLoadConfigSchematics.access(loadConfig, "contextLength");
  }

  public async getEvalBatchSize(): Promise<number> {
    const stack = getCurrentStack(1);
    const loadConfig = await super.getLoadKVConfig(stack);
    return globalConfigSchematics.access(loadConfig, "embedding.load.llama.evalBatchSize");
  }

  public async tokenize(inputString: string): Promise<Array<number>>;
  public async tokenize(inputStrings: Array<string>): Promise<Array<Array<number>>>;
  public async tokenize(
    inputString: string | Array<string>,
  ): Promise<Array<number> | Array<Array<number>>> {
    const stack = getCurrentStack(1);
    inputString = this.validator.validateMethodParamOrThrow(
      "model",
      "tokenize",
      "inputString",
      z.string().or(z.array(z.string())),
      inputString,
      stack,
    );
    if (Array.isArray(inputString)) {
      return (
        await Promise.all(
          inputString.map(s =>
            this.port.callRpc("tokenize", { specifier: this.specifier, inputString: s }, { stack }),
          ),
        )
      ).map(r => r.tokens);
    } else {
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

  public async countTokens(inputString: string): Promise<number> {
    const stack = getCurrentStack(1);
    inputString = this.validator.validateMethodParamOrThrow(
      "model",
      "countTokens",
      "inputString",
      z.string(),
      inputString,
      stack,
    );
    return (
      await this.port.callRpc(
        "countTokens",
        {
          specifier: this.specifier,
          inputString,
        },
        { stack },
      )
    ).tokenCount;
  }

  public async getLoadConfig(): Promise<EmbeddingLoadModelConfig> {
    const stack = getCurrentStack(1);
    const loadConfig = await super.getLoadKVConfig(stack);
    return kvConfigToEmbeddingLoadModelConfig(loadConfig, {
      useDefaultsForMissingKeys: true,
    });
  }
}
