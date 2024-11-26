import { BackendInterface } from "@lmstudio/lms-communication";
import { type InferClientPort } from "@lmstudio/lms-communication-client";
import {
  downloadProgressUpdateSchema,
  kebabCaseSchema,
  modelSearchOptsSchema,
  modelSearchResultDownloadOptionDataSchema,
  modelSearchResultEntryDataSchema,
  modelSearchResultIdentifierSchema,
} from "@lmstudio/lms-shared-types";
import { z } from "zod";

export function createRepositoryBackendInterface() {
  return new BackendInterface()
    .addRpcEndpoint("searchModels", {
      parameter: z.object({
        opts: modelSearchOptsSchema,
      }),
      returns: z.object({
        results: z.array(modelSearchResultEntryDataSchema),
      }),
    })
    .addRpcEndpoint("getModelDownloadOptions", {
      parameter: z.object({
        modelSearchResultIdentifier: modelSearchResultIdentifierSchema,
      }),
      returns: z.object({
        results: z.array(modelSearchResultDownloadOptionDataSchema),
      }),
    })
    .addChannelEndpoint("downloadModel", {
      creationParameter: z.object({
        downloadIdentifier: z.string(),
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
          defaultIdentifier: z.string(),
        }),
      ]),
      toServerPacket: z.discriminatedUnion("type", [
        z.object({
          type: z.literal("cancel"),
        }),
      ]),
    })
    .addChannelEndpoint("downloadArtifact", {
      creationParameter: z.object({
        artifactOwner: kebabCaseSchema,
        artifactName: kebabCaseSchema,
        revisionNumber: z.number().nullable(),
        path: z.string(),
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
    .addRpcEndpoint("push", {
      parameter: z.object({
        path: z.string(),
      }),
      returns: z.void(),
    });
}

export type RepositoryPort = InferClientPort<typeof createRepositoryBackendInterface>;
export type RepositoryBackendInterface = ReturnType<typeof createRepositoryBackendInterface>;
