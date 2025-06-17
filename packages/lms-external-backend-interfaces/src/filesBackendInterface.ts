import { BackendInterface } from "@lmstudio/lms-communication";
import { type InferClientPort } from "@lmstudio/lms-communication-client";
import {
  documentParsingLibraryIdentifierSchema,
  documentParsingOptsSchema,
  fileTypeSchema,
  internalRetrievalResultSchema,
  kvConfigSchema,
  retrievalFileProcessingStepSchema,
} from "@lmstudio/lms-shared-types";
import { z } from "zod";

export function createFilesBackendInterface() {
  return new BackendInterface()
    .addRpcEndpoint("getLocalFileAbsolutePath", {
      parameter: z.object({
        fileName: z.string(),
      }),
      returns: z.object({
        path: z.string(),
      }),
    })
    .addRpcEndpoint("uploadFileBase64", {
      parameter: z.object({
        name: z.string(),
        contentBase64: z.string(),
      }),
      returns: z.object({
        identifier: z.string(),
        fileType: fileTypeSchema,
        sizeBytes: z.number().int(),
      }),
    })
    .addChannelEndpoint("retrieve", {
      creationParameter: z.object({
        query: z.string(),
        fileIdentifiers: z.array(z.string()),
        config: kvConfigSchema,
      }),
      toServerPacket: z.discriminatedUnion("type", [
        z.object({
          type: z.literal("stop"),
        }),
      ]),
      toClientPacket: z.discriminatedUnion("type", [
        z.object({
          type: z.literal("onFileProcessList"),
          indices: z.array(z.number().int()),
        }),
        z.object({
          type: z.literal("onFileProcessingStart"),
          index: z.number().int(),
        }),
        z.object({
          type: z.literal("onFileProcessingEnd"),
          index: z.number().int(),
        }),
        z.object({
          type: z.literal("onFileProcessingStepStart"),
          index: z.number().int(),
          step: retrievalFileProcessingStepSchema,
        }),
        z.object({
          type: z.literal("onFileProcessingStepProgress"),
          index: z.number().int(),
          step: retrievalFileProcessingStepSchema,
          progress: z.number(),
        }),
        z.object({
          type: z.literal("onFileProcessingStepEnd"),
          index: z.number().int(),
          step: retrievalFileProcessingStepSchema,
        }),
        z.object({
          type: z.literal("onSearchingStart"),
        }),
        z.object({
          type: z.literal("onSearchingEnd"),
        }),
        z.object({
          type: z.literal("result"),
          result: internalRetrievalResultSchema,
        }),
      ]),
    })
    .addChannelEndpoint("parseDocument", {
      creationParameter: z.object({
        fileIdentifier: z.string(),
        parseOpts: documentParsingOptsSchema,
      }),
      toClientPacket: z.discriminatedUnion("type", [
        z.object({
          type: z.literal("parserLoaded"),
          parser: documentParsingLibraryIdentifierSchema,
        }),
        z.object({
          type: z.literal("progress"),
          progress: z.number(),
        }),
        z.object({
          type: z.literal("result"),
          content: z.string(),
          parser: documentParsingLibraryIdentifierSchema,
        }),
      ]),
      toServerPacket: z.discriminatedUnion("type", [
        z.object({
          type: z.literal("cancel"),
        }),
      ]),
    })
    .addRpcEndpoint("getDocumentParsingLibrary", {
      parameter: z.object({
        fileIdentifier: z.string(),
      }),
      returns: z.object({
        library: z.string(),
        version: z.string(),
      }),
    });
}

export type FilesPort = InferClientPort<typeof createFilesBackendInterface>;
export type FilesBackendInterface = ReturnType<typeof createFilesBackendInterface>;
