import { BackendInterface } from "@lmstudio/lms-communication";
import { type InferClientPort } from "@lmstudio/lms-communication-client";
import {
  chatHistoryDataSchema,
  chatMessageDataSchema,
  jsonSerializableSchema,
  kvConfigSchema,
  llmToolSchema,
  pluginManifestSchema,
  processingUpdateSchema,
  serializedKVConfigSchematicsSchema,
  serializedLMSExtendedErrorSchema,
} from "@lmstudio/lms-shared-types";

import { z } from "zod";

export function createPluginsBackendInterface() {
  return (
    new BackendInterface()
      /**
       * The following method is called by the controlling client. (e.g. lms-cli)
       */
      .addChannelEndpoint("registerDevelopmentPlugin", {
        creationParameter: z.object({
          manifest: pluginManifestSchema,
        }),
        toClientPacket: z.discriminatedUnion("type", [
          z.object({
            type: z.literal("ready"),
            clientIdentifier: z.string(),
            clientPasskey: z.string(),
          }),
        ]),
        toServerPacket: z.discriminatedUnion("type", [
          z.object({
            type: z.literal("end"),
          }),
        ]),
      })
      .addRpcEndpoint("reindexPlugins", {
        parameter: z.void(),
        returns: z.void(),
      })

      /**
       * The following method is called by the plugin client. (plugin:*)
       */
      .addChannelEndpoint("setPreprocessor", {
        creationParameter: z.void(),
        toClientPacket: z.discriminatedUnion("type", [
          z.object({
            type: z.literal("preprocess"),
            taskId: z.string(),
            input: chatMessageDataSchema,
            config: kvConfigSchema,
            pluginConfig: kvConfigSchema,
            /** Processing Context Identifier */
            pci: z.string(),
            token: z.string(),
          }),
          z.object({
            type: z.literal("abort"),
            taskId: z.string(),
          }),
        ]),
        toServerPacket: z.discriminatedUnion("type", [
          z.object({
            type: z.literal("complete"),
            taskId: z.string(),
            processed: chatMessageDataSchema,
          }),
          z.object({
            type: z.literal("aborted"),
            taskId: z.string(),
          }),
          z.object({
            type: z.literal("error"),
            taskId: z.string(),
            error: serializedLMSExtendedErrorSchema,
          }),
        ]),
      })
      .addChannelEndpoint("setGenerator", {
        creationParameter: z.void(),
        toClientPacket: z.discriminatedUnion("type", [
          z.object({
            type: z.literal("generate"),
            taskId: z.string(),
            config: kvConfigSchema,
            pluginConfig: kvConfigSchema,
            /** Processing Context Identifier */
            pci: z.string(),
            token: z.string(),
          }),
          z.object({
            type: z.literal("abort"),
            taskId: z.string(),
          }),
        ]),
        toServerPacket: z.discriminatedUnion("type", [
          z.object({
            type: z.literal("complete"),
            taskId: z.string(),
          }),
          z.object({
            type: z.literal("aborted"),
            taskId: z.string(),
          }),
          z.object({
            type: z.literal("error"),
            taskId: z.string(),
            error: serializedLMSExtendedErrorSchema,
          }),
        ]),
      })
      .addChannelEndpoint("setToolsProvider", {
        creationParameter: z.void(),
        toClientPacket: z.discriminatedUnion("type", [
          /**
           * Starts a "tool providing session". Once this is received, the plugin should call the
           * tools provider and pass the tools to the server using the `sessionInitialized` packet.
           *
           * If the initialization failed, the plugin should send the `sessionInitializationFailed`
           * packet.
           */
          z.object({
            type: z.literal("initSession"),
            pluginConfig: kvConfigSchema,
            sessionId: z.string(),
          }),
          z.object({
            type: z.literal("discardSession"),
            sessionId: z.string(),
          }),
          /**
           * Call a tool within a session. The plugin should call the tool and return the result
           * using the `toolCallComplete` packet.
           *
           * If the tool call fails in an unrecoverable way the plugin can send the `toolCallError`
           * packet.
           */
          z.object({
            type: z.literal("callTool"),
            sessionId: z.string(),
            callId: z.string(),
            toolName: z.string(),
            parameters: jsonSerializableSchema,
          }),
          /**
           * Abort a tool call. The plugin should abort the tool call and confirm the abort using
           * the `toolCallAborted` packet.
           */
          z.object({
            type: z.literal("abortToolCall"),
            sessionId: z.string(),
            callId: z.string(),
          }),
        ]),
        toServerPacket: z.discriminatedUnion("type", [
          /**
           * The plugin has provided a list of tools in a new session.
           */
          z.object({
            type: z.literal("sessionInitialized"),
            sessionId: z.string(),
            toolDefinitions: z.array(llmToolSchema),
          }),
          z.object({
            type: z.literal("sessionInitializationFailed"),
            sessionId: z.string(),
            error: serializedLMSExtendedErrorSchema,
          }),
          z.object({
            type: z.literal("toolCallComplete"),
            sessionId: z.string(),
            callId: z.string(),
            result: jsonSerializableSchema,
          }),
          z.object({
            type: z.literal("toolCallError"),
            sessionId: z.string(),
            callId: z.string(),
            error: serializedLMSExtendedErrorSchema,
          }),
          z.object({
            type: z.literal("toolCallStatus"),
            sessionId: z.string(),
            callId: z.string(),
            statusText: z.string(),
          }),
          z.object({
            type: z.literal("toolCallWarn"),
            sessionId: z.string(),
            callId: z.string(),
            warnText: z.string(),
          }),
        ]),
      })
      .addRpcEndpoint("processingHandleUpdate", {
        parameter: z.object({
          /** Processing Context Identifier */
          pci: z.string(),
          token: z.string(),
          update: processingUpdateSchema,
        }),
        returns: z.void(),
      })
      .addRpcEndpoint("processingPullHistory", {
        parameter: z.object({
          /** Processing Context Identifier */
          pci: z.string(),
          token: z.string(),
          includeCurrent: z.boolean(),
        }),
        returns: chatHistoryDataSchema,
      })
      .addRpcEndpoint("processingGetOrLoadModel", {
        parameter: z.object({
          /** Processing Context Identifier */
          pci: z.string(),
          token: z.string(),
        }),
        returns: z.object({
          identifier: z.string(),
        }),
      })
      .addRpcEndpoint("processingHasStatus", {
        parameter: z.object({
          /** Processing Context Identifier */
          pci: z.string(),
          token: z.string(),
        }),
        returns: z.boolean(),
      })
      .addRpcEndpoint("processingNeedsNaming", {
        parameter: z.object({
          /** Processing Context Identifier */
          pci: z.string(),
          token: z.string(),
        }),
        returns: z.boolean(),
      })
      .addRpcEndpoint("processingSuggestName", {
        parameter: z.object({
          /** Processing Context Identifier */
          pci: z.string(),
          token: z.string(),
          name: z.string(),
        }),
        returns: z.void(),
      })
      .addRpcEndpoint("processingSetSenderName", {
        parameter: z.object({
          /** Processing Context Identifier */
          pci: z.string(),
          token: z.string(),
          name: z.string(),
        }),
        returns: z.void(),
      })
      .addRpcEndpoint("setConfigSchematics", {
        parameter: z.object({
          schematics: serializedKVConfigSchematicsSchema,
        }),
        returns: z.void(),
      })
      .addRpcEndpoint("pluginInitCompleted", {
        parameter: z.void(),
        returns: z.void(),
      })
  );
}

export type PluginsPort = InferClientPort<typeof createPluginsBackendInterface>;
export type PluginsBackendInterface = ReturnType<typeof createPluginsBackendInterface>;
