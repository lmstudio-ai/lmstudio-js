import { BackendInterface } from "@lmstudio/lms-communication";
import { type InferClientPort } from "@lmstudio/lms-communication-client";
import { backendNotificationSchema, modelInfoSchema } from "@lmstudio/lms-shared-types";
import { z } from "zod";

export function createSystemBackendInterface() {
  return (
    new BackendInterface()
      .addRpcEndpoint("listDownloadedModels", {
        parameter: z.void(),
        returns: z.array(modelInfoSchema),
      })
      /**
       * Given a model key, list downloaded model variants of this model.
       */
      .addRpcEndpoint("listDownloadedModelVariants", {
        parameter: z.object({
          modelKey: z.string(),
        }),
        returns: z.array(modelInfoSchema),
      })
      .addChannelEndpoint("alive", {
        creationParameter: z.void(),
        toServerPacket: z.void(),
        toClientPacket: z.void(),
      })
      .addRpcEndpoint("notify", {
        parameter: backendNotificationSchema,
        returns: z.void(),
      })
      /**
       * Get the LM Studio version
       */
      .addRpcEndpoint("version", {
        parameter: z.void(),
        returns: z.object({
          /**
           * `major.minor.patch`
           */
          version: z.string(),
          /**
           * LM Studio build number
           */
          build: z.number(),
        }),
      })
      .addRpcEndpoint("setExperimentFlag", {
        parameter: z.object({
          code: z.string(),
          value: z.boolean(),
        }),
        returns: z.void(),
      })
      .addRpcEndpoint("getExperimentFlags", {
        parameter: z.void(),
        returns: z.array(z.string()),
      })
      .addRpcEndpoint("startHttpServer", {
        parameter: z.object({
          port: z.number().int().min(1).max(65535).optional(),
          cors: z.boolean().optional(),
          networkInterface: z.string().optional(),
        }),
        returns: z.void(),
      })
      .addRpcEndpoint("stopHttpServer", {
        parameter: z.void(),
        returns: z.void(),
      })
      .addRpcEndpoint("info", {
        parameter: z.void(),
        returns: z.object({
          pid: z.number().int(),
          isDaemon: z.boolean(),
          version: z.string(),
        }),
      })
      .addRpcEndpoint("requestShutdown", {
        parameter: z.void(),
        returns: z.void(),
      })
  );
}

export type SystemPort = InferClientPort<typeof createSystemBackendInterface>;
export type SystemBackendInterface = ReturnType<typeof createSystemBackendInterface>;
