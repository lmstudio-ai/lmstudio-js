import { type SimpleLogger, type Validator } from "@lmstudio/lms-common";
import { type DecisionPort } from "@lmstudio/lms-external-backend-interfaces";
import { decisionLoadModelConfigToKVConfig } from "@lmstudio/lms-kv-config";
import {
  decisionLoadModelConfigSchema,
  type DecisionLoadModelConfig,
  type DecisionModelInfo,
  type DecisionModelInstanceInfo,
  type ModelSpecifier,
} from "@lmstudio/lms-shared-types";
import { ModelNamespace } from "../modelShared/ModelNamespace.js";
import { DecisionDynamicHandle } from "./DecisionDynamicHandle.js";
import { DecisionModel } from "./DecisionModel.js";

/** @public */
export class DecisionNamespace extends ModelNamespace<
  /** @internal */
  DecisionPort,
  DecisionLoadModelConfig,
  DecisionModelInstanceInfo,
  DecisionModelInfo,
  DecisionDynamicHandle,
  DecisionModel
> {
  /** @internal */
  protected override readonly namespace = "decision";
  /** @internal */
  protected override readonly defaultLoadConfig = {};
  /** @internal */
  protected override readonly loadModelConfigSchema = decisionLoadModelConfigSchema;
  /** @internal */
  protected override loadConfigToKVConfig = decisionLoadModelConfigToKVConfig;
  /** @internal */
  protected override createDomainSpecificModel(
    port: DecisionPort,
    info: DecisionModelInstanceInfo,
    validator: Validator,
    logger: SimpleLogger,
  ): DecisionModel {
    return new DecisionModel(port, info, validator, logger);
  }
  /** @internal */
  protected override createDomainDynamicHandle(
    port: DecisionPort,
    specifier: ModelSpecifier,
    validator: Validator,
    logger: SimpleLogger,
  ): DecisionDynamicHandle {
    return new DecisionDynamicHandle(port, specifier, validator, logger);
  }
}
