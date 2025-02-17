import { type InferClientPort } from "@lmstudio/lms-communication-client";
import { type createBaseModelBackendInterface } from "@lmstudio/lms-external-backend-interfaces";
import { type ModelInstanceInfoBase } from "@lmstudio/lms-shared-types";
import { type DynamicHandle } from "./DynamicHandle.js";

/**
 * @public
 */
export interface SpecificModel<
  /** @internal */
  TClientPort extends InferClientPort<typeof createBaseModelBackendInterface>,
> extends DynamicHandle<
    // prettier-ignore
    /** @internal */ TClientPort,
    ModelInstanceInfoBase
  > {
  readonly identifier: string;
  readonly path: string;
  unload(): Promise<void>;
}
