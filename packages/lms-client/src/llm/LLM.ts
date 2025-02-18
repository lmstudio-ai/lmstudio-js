import { getCurrentStack, SimpleLogger, type Validator } from "@lmstudio/lms-common";
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
  }
  public async unload() {
    const stack = getCurrentStack(1);
    await this.port.callRpc("unloadModel", { identifier: this.identifier }, { stack });
  }
}
