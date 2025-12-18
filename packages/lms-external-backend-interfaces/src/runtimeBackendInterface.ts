import { BackendInterface } from "@lmstudio/lms-communication";
import { type InferClientPort } from "@lmstudio/lms-communication-client";
import {
  downloadableRuntimeExtensionInfoSchema,
  downloadProgressUpdateSchema,
  modelFormatNameSchema,
  runtimeEngineInfoSchema,
  runtimeEngineSpecifierSchema,
  runtimeHardwareSurveyResultSchema,
  runtimeHardwareSurveyScopeSchema,
  selectedRuntimeEngineMapSchema,
} from "@lmstudio/lms-shared-types";
import { z } from "zod";

export function createRuntimeBackendInterface() {
  return (
    new BackendInterface()
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
      })
      .addRpcEndpoint("surveyHardware", {
        parameter: runtimeHardwareSurveyScopeSchema.optional(),
        returns: runtimeHardwareSurveyResultSchema,
      })
      /**
       * Search available online engines by a query string.
       */
      .addRpcEndpoint("searchRuntimeExtensions", {
        parameter: z.object({
          /**
           * The query string. Examples: `llama.cpp`, `llama.cpp:cuda`, `:linux`, `llama.cpp@1.2.3`.
           */
          query: z.string(),
          /**
           * By default, uses app global settings. If specified, overrides the global setting for
           * this request.
           */
          channelOverride: z.enum(["stable", "beta"]).optional(),
          /**
           * Whether to include incompatible engines in the results.
           */
          includeIncompatible: z.boolean(),
        }),
        returns: z.object({
          extensions: z.array(downloadableRuntimeExtensionInfoSchema),
        }),
      })
      /**
       * Start download and track the downloading of a runtime extension.
       */
      .addChannelEndpoint("downloadRuntimeExtension", {
        creationParameter: z.object({
          name: z.string(),
          version: z.string(),
          /**
           * If another version of this runtime extension is installed and currently selected,
           * controls whether to switch those selections to the newly downloaded version.
           *
           * - false: download only; keep existing selections.
           * - true: update selections to the new version.
           *
           * No effect if no other version exists or is being used.
           */
          updateSelections: z.boolean(),
        }),
        toClientPacket: z.discriminatedUnion("type", [
          z.object({
            type: z.literal("downloadProgress"),
            update: downloadProgressUpdateSchema,
          }),
          z.object({
            type: z.literal("startFinalizing"),
          }),
          z.object({
            type: z.literal("success"),
          }),
        ]),
        toServerPacket: z.discriminatedUnion("type", [
          z.object({
            type: z.literal("cancel"),
          }),
        ]),
      })
  );
}

export type RuntimePort = InferClientPort<typeof createRuntimeBackendInterface>;
export type RuntimeBackendInterface = ReturnType<typeof createRuntimeBackendInterface>;
