import {
  getCurrentStack,
  makePrettyError,
  SimpleLogger,
  type Validator,
} from "@lmstudio/lms-common";
import { type LLMPort } from "@lmstudio/lms-external-backend-interfaces";
import {
  type LLMInstanceInfo,
  type ModelCompatibilityType,
  type ModelSpecifier,
} from "@lmstudio/lms-shared-types";
import { type SpecificModel } from "../modelShared/SpecificModel.js";
import { LLMDynamicHandle } from "./LLMDynamicHandle.js";

/**
 * Represents a specific loaded LLM. Most LLM related operations are inherited from
 * {@link LLMDynamicHandle}.
 *
 * @public
 */
export class LLM
  extends LLMDynamicHandle
  implements
    SpecificModel<// prettier-ignore
    /** @internal */ LLMPort>
{
  public readonly identifier: string;
  public readonly path: string;
  public readonly modelKey: string;
  public readonly format: ModelCompatibilityType;
  public readonly displayName: string;
  public readonly sizeBytes: number;
  public readonly vision: boolean;
  public readonly trainedForToolUse: boolean;
  /**
   * Unique stable identifier for the model instance.
   *
   * @deprecated [DEP-LOW-LEVEL] This API is not guaranteed to not change nor to continue to exist
   * in the future.
   */
  public readonly instanceReference: string;
  /**
   * A more stable identifier for the model that mostly consists of path to the model. Can be very
   * long. Not suitable for displaying. Use `modelKey` for most purposes.
   *
   * @deprecated [DEP-LOW-LEVEL] This API is not guaranteed to not change nor to continue to exist
   * in the future.
   */
  public readonly indexedModelIdentifier: string;

  /** @internal */
  public constructor(
    llmPort: LLMPort,
    info: LLMInstanceInfo,
    validator: Validator,
    logger: SimpleLogger = new SimpleLogger(`LLM`),
  ) {
    const specifier: ModelSpecifier = {
      type: "instanceReference",
      instanceReference: info.instanceReference,
    };
    super(llmPort, specifier, validator, logger);
    this.identifier = info.identifier;
    this.path = info.path;
    this.modelKey = info.modelKey;
    this.format = info.format;
    this.displayName = info.displayName;
    this.sizeBytes = info.sizeBytes;
    this.vision = info.vision;
    this.trainedForToolUse = info.trainedForToolUse;
    this.instanceReference = info.instanceReference;
    this.indexedModelIdentifier = info.indexedModelIdentifier;
  }
  public async unload() {
    const stack = getCurrentStack(1);
    const modelInfo = await this.getModelInfo();
    const deviceIdentifier = modelInfo.deviceIdentifier ?? null;
    await this.port.callRpc(
      "unloadModel",
      {
        identifier: this.identifier,
        deviceIdentifier,
      },
      { stack },
    );
  }
  public override async getModelInfo(): Promise<LLMInstanceInfo> {
    const info = await super.getModelInfo();
    if (info === undefined) {
      const stack = getCurrentStack(1);
      throw makePrettyError("This model has already been unloaded", stack);
    }
    return info;
  }
}
