import { BackendInterface } from "@lmstudio/lms-communication";
import { type InferClientPort } from "@lmstudio/lms-communication-client";
import {
  downloadableRuntimeExtensionInfoSchema,
  downloadProgressUpdateSchema,
  modelFormatNameSchema,
  runtimeEngineInfoSchema,
  runtimeEngineSpecifierSchema,
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
