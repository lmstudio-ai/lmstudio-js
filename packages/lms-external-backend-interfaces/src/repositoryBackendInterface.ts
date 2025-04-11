import { BackendInterface } from "@lmstudio/lms-communication";
import { type InferClientPort } from "@lmstudio/lms-communication-client";
import {
  downloadProgressUpdateSchema,
  kebabCaseSchema,
  kebabCaseWithDotsSchema,
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
        artifactName: kebabCaseWithDotsSchema,
        revisionNumber: z.number().int().nullable(),
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
    .addRpcEndpoint("installPluginDependencies", {
      parameter: z.object({
        pluginFolder: z.string(),
      }),
      returns: z.void(),
    })
    .addChannelEndpoint("pushArtifact", {
      creationParameter: z.object({
        path: z.string(),
      }),
      toServerPacket: z.void(),
      toClientPacket: z.discriminatedUnion("type", [
        z.object({
          type: z.literal("message"),
          message: z.string(),
        }),
      ]),
    })
    .addChannelEndpoint("ensureAuthenticated", {
      creationParameter: z.void(),
      toServerPacket: z.void(),
      toClientPacket: z.discriminatedUnion("type", [
        z.object({
          type: z.literal("authenticationUrl"),
          url: z.string(),
        }),
        z.object({
          type: z.literal("authenticated"),
        }),
      ]),
    });
}

export type RepositoryPort = InferClientPort<typeof createRepositoryBackendInterface>;
export type RepositoryBackendInterface = ReturnType<typeof createRepositoryBackendInterface>;
