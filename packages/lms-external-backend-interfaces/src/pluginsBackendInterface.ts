import { BackendInterface } from "@lmstudio/lms-communication";
import { type InferClientPort } from "@lmstudio/lms-communication-client";
import {
  chatHistoryDataSchema,
  chatMessageDataSchema,
  jsonSerializableSchema,
  kvConfigSchema,
  llmPredictionFragmentInputOptsSchema,
  llmPredictionFragmentSchema,
  llmToolSchema,
  pluginConfigSpecifierSchema,
  pluginManifestSchema,
  processingRequestResponseSchema,
  processingRequestSchema,
  processingUpdateSchema,
  remotePluginInfoSchema,
  serializedKVConfigSchematicsSchema,
  serializedLMSExtendedErrorSchema,
  tokenSourceIdentifierSchema,
  toolCallRequestSchema,
} from "@lmstudio/lms-shared-types";

import { z } from "zod";

export function createPluginsBackendInterface() {
  return (
    new BackendInterface()
      /**
       * The following method is called by a client that wants to use plugins that are registered
       * to LM Studio.
       */
      .addChannelEndpoint("startToolUseSession", {
        creationParameter: z.object({
          pluginIdentifier: z.string(),
          pluginConfigSpecifier: pluginConfigSpecifierSchema,
        }),
        toClientPacket: z.discriminatedUnion("type", [
          /**
           * The session has been started successfully. The client can now use the session. Note,
           * there are no sessionError message because if a session fails to start, the channel
           * will error instead.
           */
          z.object({
            type: z.literal("sessionReady"),
            toolDefinitions: z.array(llmToolSchema),
          }),
          /**
           * A tool call has been completed.
           */
          z.object({
            type: z.literal("toolCallComplete"),
            callId: z.number(),
            result: jsonSerializableSchema,
          }),
          /**
           * A tool call has failed.
           */
          z.object({
            type: z.literal("toolCallError"),
            callId: z.number(),
            error: serializedLMSExtendedErrorSchema,
          }),
          /**
           * Status update for a tool call.
           */
          z.object({
            type: z.literal("toolCallStatus"),
            callId: z.number(),
            statusText: z.string(),
          }),
          /**
           * Warning message for a tool call.
           */
          z.object({
            type: z.literal("toolCallWarn"),
            callId: z.number(),
            warnText: z.string(),
          }),
        ]),
        toServerPacket: z.discriminatedUnion("type", [
          /**
           * Request to start a tool call. This call can be aborted using the `abortToolCall`
           * packet. When the tool call is completed, either the `toolCallResult` or `toolCallError`
           * packet will be sent.
           */
          z.object({
            type: z.literal("callTool"),
            callId: z.number(),
            name: z.string(),
            arguments: jsonSerializableSchema,
          }),
          /**
           * Request to abort a tool call. Upon calling this, no toolCallComplete or toolCallError
           * packets will be sent for the call. We assume abort is done immediately.
           */
          z.object({
            type: z.literal("abortToolCall"),
            callId: z.number(),
          }),
          /**
           * Client requests to discard the session. Upon calling this, the channel will be closed.
           */
          z.object({
            type: z.literal("discardSession"),
          }),
        ]),
      })

      .addChannelEndpoint("generateWithGenerator", {
        creationParameter: z.object({
          pluginIdentifier: z.string(),
          pluginConfigSpecifier: pluginConfigSpecifierSchema,
          tools: z.array(llmToolSchema),
          history: chatHistoryDataSchema,
        }),
        toClientPacket: z.discriminatedUnion("type", [
          z.object({
            type: z.literal("fragment"),
            fragment: llmPredictionFragmentSchema,
          }),
          z.object({
            type: z.literal("promptProcessingProgress"),
            progress: z.number(),
          }),
          z.object({
            type: z.literal("toolCallGenerationStart"),
            /**
             * The LLM specific call id of the tool call.
             */
            toolCallId: z.string().optional(),
          }),
          z.object({
            type: z.literal("toolCallGenerationNameReceived"),
            name: z.string(),
          }),
          z.object({
            type: z.literal("toolCallGenerationArgumentFragmentGenerated"),
            content: z.string(),
          }),
          z.object({
            type: z.literal("toolCallGenerationEnd"),
            toolCallRequest: toolCallRequestSchema,
          }),
          z.object({
            type: z.literal("toolCallGenerationFailed"),
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
      .addChannelEndpoint("setPromptPreprocessor", {
        creationParameter: z.void(),
        toClientPacket: z.discriminatedUnion("type", [
          z.object({
            type: z.literal("preprocess"),
            taskId: z.string(),
            input: chatMessageDataSchema,
            config: kvConfigSchema,
            pluginConfig: kvConfigSchema,
            globalPluginConfig: kvConfigSchema,
            workingDirectoryPath: z.string().nullable(),
            /**
             * An array of all the plugins that are enabled for this prediction.
             */
            enabledPluginInfos: z.array(remotePluginInfoSchema),
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
      .addChannelEndpoint("setPredictionLoopHandler", {
        creationParameter: z.void(),
        toClientPacket: z.discriminatedUnion("type", [
          z.object({
            type: z.literal("handlePredictionLoop"),
            taskId: z.string(),
            config: kvConfigSchema,
            pluginConfig: kvConfigSchema,
            globalPluginConfig: kvConfigSchema,
            workingDirectoryPath: z.string().nullable(),
            /**
             * An array of all the plugins that are enabled for this prediction.
             */
            enabledPluginInfos: z.array(remotePluginInfoSchema),
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
            globalPluginConfig: kvConfigSchema,
            workingDirectoryPath: z.string().nullable(),
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
      .addChannelEndpoint("setGenerator", {
        creationParameter: z.void(),
        toClientPacket: z.discriminatedUnion("type", [
          z.object({
            type: z.literal("generate"),
            taskId: z.string(),
            input: chatHistoryDataSchema,
            pluginConfig: kvConfigSchema,
            globalPluginConfig: kvConfigSchema,
            toolDefinitions: z.array(llmToolSchema),
            workingDirectoryPath: z.string().nullable(),
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
          z.object({
            type: z.literal("fragmentGenerated"),
            taskId: z.string(),
            content: z.string(),
            opts: llmPredictionFragmentInputOptsSchema,
          }),
          z.object({
            type: z.literal("toolCallGenerationStarted"),
            taskId: z.string(),
            toolCallId: z.string().optional(),
          }),
          z.object({
            type: z.literal("toolCallGenerationNameReceived"),
            taskId: z.string(),
            toolName: z.string(),
          }),
          z.object({
            type: z.literal("toolCallGenerationArgumentFragmentGenerated"),
            taskId: z.string(),
            content: z.string(),
          }),
          z.object({
            type: z.literal("toolCallGenerationEnded"),
            taskId: z.string(),
            toolCallRequest: toolCallRequestSchema,
          }),
          z.object({
            type: z.literal("toolCallGenerationFailed"),
            taskId: z.string(),
            error: serializedLMSExtendedErrorSchema,
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
      .addRpcEndpoint("processingHandleRequest", {
        parameter: z.object({
          /** Processing Context Identifier */
          pci: z.string(),
          token: z.string(),
          request: processingRequestSchema,
        }),
        returns: z.object({
          response: processingRequestResponseSchema,
        }),
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
      .addRpcEndpoint("processingGetOrLoadTokenSource", {
        parameter: z.object({
          /** Processing Context Identifier */
          pci: z.string(),
          token: z.string(),
        }),
        returns: z.object({
          tokenSourceIdentifier: tokenSourceIdentifierSchema,
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
      .addRpcEndpoint("setGlobalConfigSchematics", {
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
