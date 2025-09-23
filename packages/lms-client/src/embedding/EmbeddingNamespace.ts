import { type SimpleLogger, type Validator } from "@lmstudio/lms-common";
import { type EmbeddingPort } from "@lmstudio/lms-external-backend-interfaces";
import { embeddingLoadModelConfigToKVConfig } from "@lmstudio/lms-kv-config";
import {
  embeddingLoadModelConfigSchema,
  type EmbeddingLoadModelConfig,
  type EmbeddingModelInfo,
  type EmbeddingModelInstanceInfo,
  type ModelSpecifier,
} from "@lmstudio/lms-shared-types";
import { ModelNamespace } from "../modelShared/ModelNamespace.js";
import { EmbeddingDynamicHandle } from "./EmbeddingDynamicHandle.js";
import { EmbeddingModel } from "./EmbeddingModel.js";

/** @public */
export class EmbeddingNamespace extends ModelNamespace<
  /** @internal */
  EmbeddingPort,
  EmbeddingLoadModelConfig,
  EmbeddingModelInstanceInfo,
  EmbeddingModelInfo,
  EmbeddingDynamicHandle,
  EmbeddingModel
> {
  /** @internal */
  protected override readonly namespace = "embedding";
  /** @internal */
  protected override readonly defaultLoadConfig = {};
  /** @internal */
  protected override readonly loadModelConfigSchema = embeddingLoadModelConfigSchema;
  /** @internal */
  protected override loadConfigToKVConfig = embeddingLoadModelConfigToKVConfig;
  /** @internal */
  protected override createDomainSpecificModel(
    port: EmbeddingPort,
    info: EmbeddingModelInstanceInfo,
    validator: Validator,
    logger: SimpleLogger,
  ): EmbeddingModel {
    return new EmbeddingModel(port, info, validator, logger);
  }
  /** @internal */
  protected override createDomainDynamicHandle(
    port: EmbeddingPort,
    specifier: ModelSpecifier,
    validator: Validator,
    logger: SimpleLogger,
  ): EmbeddingDynamicHandle {
    return new EmbeddingDynamicHandle(port, specifier, validator, logger);
  }
}
