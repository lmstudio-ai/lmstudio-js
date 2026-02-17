import { BackendInterface } from "@lmstudio/lms-communication";
import { type InferClientPort } from "@lmstudio/lms-communication-client";
import { diagnosticsLogEventSchema } from "@lmstudio/lms-shared-types";
import { z } from "zod";

export function createDiagnosticsBackendInterface() {
  return new BackendInterface().addChannelEndpoint("streamLogs", {
    creationParameter: z
      .object({
        originDeviceIdentifier: z.string().optional(),
      })
      .optional(),
    toServerPacket: z.discriminatedUnion("type", [
      z.object({
        type: z.literal("stop"),
      }),
    ]),
    toClientPacket: z.discriminatedUnion("type", [
      z.object({
        type: z.literal("log"),
        log: diagnosticsLogEventSchema,
      }),
    ]),
  });
}

export type DiagnosticsPort = InferClientPort<typeof createDiagnosticsBackendInterface>;
export type DiagnosticsBackendInterface = ReturnType<typeof createDiagnosticsBackendInterface>;
