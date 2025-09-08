import { BackendInterface } from "@lmstudio/lms-communication";
import { type InferClientPort } from "@lmstudio/lms-communication-client";
import {
  runtimeEngineInfoSchema,
  runtimeEngineSelectionInfoSchema,
  runtimeEngineSpecifierSchema,
} from "@lmstudio/lms-shared-types";
import { z } from "zod";

export function createRuntimeBackendInterface() {
  return new BackendInterface()
    .addRpcEndpoint("list", {
      parameter: z.void(),
      returns: z.array(runtimeEngineInfoSchema),
    })
    .addRpcEndpoint("getSelections", {
      parameter: z.void(),
      returns: z.array(runtimeEngineSelectionInfoSchema),
    })
    .addRpcEndpoint("select", {
      parameter: z.object({
        engine: runtimeEngineSpecifierSchema,
        modelFormat: z.string(),
      }),
      returns: z.void(),
    })
    .addRpcEndpoint("remove", {
      parameter: runtimeEngineSpecifierSchema,
      returns: z.void(),
    });
}

export type RuntimePort = InferClientPort<typeof createRuntimeBackendInterface>;
export type RuntimeBackendInterface = ReturnType<typeof createRuntimeBackendInterface>;
