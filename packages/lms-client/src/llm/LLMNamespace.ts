import { type SimpleLogger, type Validator } from "@lmstudio/lms-common";
import { type LLMPort } from "@lmstudio/lms-external-backend-interfaces";
import { llmLoadModelConfigToKVConfig } from "@lmstudio/lms-kv-config";
import {
  llmLoadModelConfigSchema,
  type LLMInfo,
  type LLMInstanceInfo,
  type LLMLoadModelConfig,
  type ModelSpecifier,
} from "@lmstudio/lms-shared-types";
import { ModelNamespace } from "../modelShared/ModelNamespace.js";
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
  protected override loadConfigToKVConfig = llmLoadModelConfigToKVConfig;
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
