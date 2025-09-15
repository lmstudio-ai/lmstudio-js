import { BackendInterface } from "@lmstudio/lms-communication";
import { type InferClientPort } from "@lmstudio/lms-communication-client";
import {
  modelFormatNameSchema,
  runtimeEngineInfoSchema,
  runtimeEngineSpecifierSchema,
  selectedRuntimeEngineMapSchema,
} from "@lmstudio/lms-shared-types";
import { z } from "zod";

export function createRuntimeBackendInterface() {
  return new BackendInterface()
    .addRpcEndpoint("listEngines", {
      parameter: z.void(),
      returns: z.array(runtimeEngineInfoSchema),
    })
    .addRpcEndpoint("getEngineSelections", {
      parameter: z.void(),
      returns: selectedRuntimeEngineMapSchema,
      serialization: "superjson",
    })
    .addRpcEndpoint("selectEngine", {
      parameter: z.object({
        engine: runtimeEngineSpecifierSchema,
        modelFormatName: modelFormatNameSchema,
      }),
      returns: z.void(),
    })
    .addRpcEndpoint("removeEngine", {
      parameter: runtimeEngineSpecifierSchema,
      returns: z.void(),
    });
}

export type RuntimePort = InferClientPort<typeof createRuntimeBackendInterface>;
export type RuntimeBackendInterface = ReturnType<typeof createRuntimeBackendInterface>;
