import { getCurrentStack, SimpleLogger, type Validator } from "@lmstudio/lms-common";
import { type DecisionPort } from "@lmstudio/lms-external-backend-interfaces";
import { kvConfigToDecisionLoadModelConfig } from "@lmstudio/lms-kv-config";
import {
  type DecisionLoadModelConfig,
  type DecisionModelInstanceInfo,
  type ModelSpecifier,
} from "@lmstudio/lms-shared-types";
import { DynamicHandle } from "../modelShared/DynamicHandle.js";

/** Decision model lifecycle handle. Inference is not part of the public SDK. @public */
export class DecisionDynamicHandle extends DynamicHandle<
  // prettier-ignore
  /** @internal */ DecisionPort,
  DecisionModelInstanceInfo
> {
  /** @internal */
  public constructor(
    port: DecisionPort,
    specifier: ModelSpecifier,
    _validator: Validator,
    _logger: SimpleLogger = new SimpleLogger("DecisionModel"),
  ) {
    super(port, specifier);
  }
  public async getLoadConfig(): Promise<DecisionLoadModelConfig> {
    return kvConfigToDecisionLoadModelConfig(await super.getLoadKVConfig(getCurrentStack(1)), {
      useDefaultsForMissingKeys: true,
    });
  }
  public async getContextLength(): Promise<number> {
    const info = await this.getModelInfo();
    if (info === undefined) {
      throw new Error("This model has been unloaded");
    }
    return info.contextLength;
  }
}
