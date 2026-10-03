import {
  type DecisionModelInfo,
  decisionModelInfoSchema,
  type DecisionModelInstanceInfo,
  decisionModelInstanceInfoSchema,
} from "@lmstudio/lms-shared-types";
import {
  type BaseModelBackendInterface,
  type BaseModelPort,
  createBaseModelBackendInterface,
} from "./baseModelBackendInterface.js";

/** Decision discovery and lifecycle only; inference is an internal app/engine contract. */
export function createDecisionBackendInterface(): DecisionBackendInterface {
  return createBaseModelBackendInterface(
    decisionModelInstanceInfoSchema,
    decisionModelInfoSchema,
  ) as unknown as DecisionBackendInterface;
}

export type DecisionBackendInterface = BaseModelBackendInterface<
  DecisionModelInstanceInfo,
  DecisionModelInfo
>;
export type DecisionPort = BaseModelPort<DecisionModelInstanceInfo, DecisionModelInfo>;
