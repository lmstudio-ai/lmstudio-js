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

  /**
   * List all available (downloaded) LLM models.
   *
   * This is a convenience method that returns all downloaded LLM models. It's equivalent to
   * calling `client.system.listDownloadedModels("llm")`.
   *
   * @example
   * ```ts
   * const availableModels = await client.llm.listAvailable();
   * console.log(`Found ${availableModels.length} available LLM models`);
   * for (const model of availableModels) {
   *   console.log(`- ${model.displayName} (${model.modelKey})`);
   * }
   * ```
   *
   * @returns A promise that resolves to an array of available LLM model information
   * @public
   */
  public async listAvailable(): Promise<Array<LLMInfo>> {
    return await this.client.system.listDownloadedModels("llm");
  }
}
