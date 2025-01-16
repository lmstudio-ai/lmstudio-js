import { type SimpleLogger, type Validator } from "@lmstudio/lms-common";
import { type EmbeddingPort } from "@lmstudio/lms-external-backend-interfaces";
import { embeddingLlamaLoadConfigSchematics } from "@lmstudio/lms-kv-config";
import {
  embeddingLoadModelConfigSchema,
  type EmbeddingLoadModelConfig,
  type KVConfig,
  type ModelDescriptor,
  type ModelSpecifier,
} from "@lmstudio/lms-shared-types";
import { ModelNamespace } from "../modelShared/ModelNamespace.js";
import { numberToCheckboxNumeric } from "../numberToCheckboxNumeric.js";
import { EmbeddingDynamicHandle } from "./EmbeddingDynamicHandle.js";
import { EmbeddingSpecificModel } from "./EmbeddingSpecificModel.js";

/** @public */
export class EmbeddingNamespace extends ModelNamespace<
  /** @internal */
  EmbeddingPort,
  EmbeddingLoadModelConfig,
  EmbeddingDynamicHandle,
  EmbeddingSpecificModel
> {
  /** @internal */
  protected override readonly namespace = "embedding";
  /** @internal */
  protected override readonly defaultLoadConfig = {};
  /** @internal */
  protected override readonly loadModelConfigSchema = embeddingLoadModelConfigSchema;
  /** @internal */
  protected override loadConfigToKVConfig(config: EmbeddingLoadModelConfig): KVConfig {
    return embeddingLlamaLoadConfigSchematics.buildPartialConfig({
      "llama.acceleration.offloadRatio": config.gpuOffload?.ratio,
      "llama.load.mainGpu": config.gpuOffload?.mainGpu,
      "llama.load.tensorSplit": config.gpuOffload?.tensorSplit,
      "llama.load.splitStrategy": config.gpuOffload?.splitStrategy,
      "contextLength": config.contextLength,
      "llama.ropeFrequencyBase": numberToCheckboxNumeric(config.ropeFrequencyBase, 0, 0),
      "llama.ropeFrequencyScale": numberToCheckboxNumeric(config.ropeFrequencyScale, 0, 0),
      "llama.keepModelInMemory": config.keepModelInMemory,
      "llama.tryMmap": config.tryMmap,
    });
  }
  /** @internal */
  protected override createDomainSpecificModel(
    port: EmbeddingPort,
    instanceReference: string,
    descriptor: ModelDescriptor,
    validator: Validator,
    logger: SimpleLogger,
  ): EmbeddingSpecificModel {
    return new EmbeddingSpecificModel(port, instanceReference, descriptor, validator, logger);
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
