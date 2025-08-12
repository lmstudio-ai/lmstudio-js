import { type SimpleLogger, type Validator } from "@lmstudio/lms-common";
import { type LLMPort } from "@lmstudio/lms-external-backend-interfaces";
import { llmLlamaMoeLoadConfigSchematics } from "@lmstudio/lms-kv-config";
import {
  convertGPUSettingToGPUSplitConfig,
  llmLoadModelConfigSchema,
  type KVConfig,
  type LLMInfo,
  type LLMInstanceInfo,
  type LLMLoadModelConfig,
  type ModelSpecifier,
} from "@lmstudio/lms-shared-types";
import { cacheQuantizationTypeToCheckbox } from "../cacheQuantizationTypeToCheckbox.js";
import { ModelNamespace } from "../modelShared/ModelNamespace.js";
import { numberToCheckboxNumeric } from "../numberToCheckboxNumeric.js";
import { LLM } from "./LLM.js";
import { LLMDynamicHandle } from "./LLMDynamicHandle.js";

/** @public */
export class LLMNamespace extends ModelNamespace<
  /** @internal */
  LLMPort,
  LLMLoadModelConfig,
  LLMInstanceInfo,
  LLMInfo,
  LLMDynamicHandle,
  LLM
> {
  /** @internal */
  protected override readonly namespace = "llm";
  /** @internal */
  protected override readonly defaultLoadConfig = {};
  /** @internal */
  protected override readonly loadModelConfigSchema = llmLoadModelConfigSchema;
  /** @internal */
  protected override loadConfigToKVConfig(config: LLMLoadModelConfig): KVConfig {
    return llmLlamaMoeLoadConfigSchematics.buildPartialConfig({
      "contextLength": config.contextLength,
      "llama.evalBatchSize": config.evalBatchSize,
      "llama.acceleration.offloadRatio": config.gpu?.ratio,
      "numCpuExpertLayersRatio": config.gpu?.numCpuExpertLayersRatio,
      "load.gpuSplitConfig": convertGPUSettingToGPUSplitConfig(config.gpu),
      "llama.flashAttention": config.flashAttention,
      "llama.ropeFrequencyBase": numberToCheckboxNumeric(config.ropeFrequencyBase, 0, 0),
      "llama.ropeFrequencyScale": numberToCheckboxNumeric(config.ropeFrequencyScale, 0, 0),
      "llama.keepModelInMemory": config.keepModelInMemory,
      "seed": numberToCheckboxNumeric(config.seed, -1, 0),
      "llama.useFp16ForKVCache": config.useFp16ForKVCache,
      "llama.tryMmap": config.tryMmap,
      "numExperts": config.numExperts,
      "llama.kCacheQuantizationType": cacheQuantizationTypeToCheckbox({
        value: config.llamaKCacheQuantizationType,
        falseDefault: "f16",
      }),
      "llama.vCacheQuantizationType": cacheQuantizationTypeToCheckbox({
        value: config.llamaVCacheQuantizationType,
        falseDefault: "f16",
      }),
    });
  }
  /** @internal */
  protected override createDomainSpecificModel(
    port: LLMPort,
    info: LLMInstanceInfo,
    validator: Validator,
    logger: SimpleLogger,
  ): LLM {
    return new LLM(port, info, validator, logger);
  }
  /** @internal */
  protected override createDomainDynamicHandle(
    port: LLMPort,
    specifier: ModelSpecifier,
    validator: Validator,
    logger: SimpleLogger,
  ): LLMDynamicHandle {
    return new LLMDynamicHandle(port, specifier, validator, logger);
  }
}
