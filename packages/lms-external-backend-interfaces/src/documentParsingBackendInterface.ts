import { BackendInterface } from "@lmstudio/lms-communication";
import { type InferClientPort } from "@lmstudio/lms-communication-client";
import { z } from "zod";

export function createDocumentParsingBackendInterface() {
  return new BackendInterface().addRpcEndpoint("parseDocument", {
    parameter: z.object({
      fileIdentifier: z.string(),
    }),
    returns: z.object({
      content: z.string(),
    }),
  });
}

export type DocumentParsingPort = InferClientPort<typeof createDocumentParsingBackendInterface>;
export type DocumentParsingBackendInterface = ReturnType<
  typeof createDocumentParsingBackendInterface
>;
