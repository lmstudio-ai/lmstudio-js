import { BackendInterface } from "@lmstudio/lms-communication";
import { type InferClientPort } from "@lmstudio/lms-communication-client";
import {
  artifactDownloadPlanSchema,
  authenticationStatusSchema,
  downloadProgressUpdateSchema,
  hubModelSchema,
  jsonSerializableSchema,
  kebabCaseSchema,
  kebabCaseWithDotsSchema,
  lmLinkSetupComputeDeviceResultSchema,
  lmLinkStatusResultSchema,
  localArtifactFileListSchema,
  modelCompatibilityTypeSchema,
  modelDownloadSourceSchema,
  modelSearchOptsSchema,
  modelSearchResultDownloadOptionDataSchema,
  modelSearchResultEntryDataSchema,
  modelSearchResultIdentifierSchema,
} from "@lmstudio/lms-shared-types";
import { z } from "zod";

const repositoryDownloadPlannerResolutionPreferenceSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("fileName"),
    fileName: z.string(),
  }),
  z.object({
    type: z.literal("quantName"),
    quantName: z.string(),
  }),
]);

const repositoryDownloadPlannerOptsSchema = z.object({
  resolutionPreference: z.array(repositoryDownloadPlannerResolutionPreferenceSchema).optional(),
  compatibilityTypes: z.array(modelCompatibilityTypeSchema).optional(),
});

const repositoryDownloadPlannerTargetSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("artifact"),
    owner: kebabCaseSchema,
    name: kebabCaseWithDotsSchema,
  }),
  z.object({
    type: z.literal("model"),
    source: modelDownloadSourceSchema,
  }),
]);

const fuzzyFindStaffPickResultSchema = z.object({
  owner: kebabCaseSchema,
  name: kebabCaseWithDotsSchema,
  revisionNumber: z.number().int(),
  createdAtTimestamp: z.number().int(),
  description: z.string(),
  exact: z.boolean(),
});

export function createRepositoryBackendInterface() {
  return (
    new BackendInterface()
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
      /**
       * Downloads one singular artifact at a certain revision. Ignore dependencies.
       */
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
      /**
       * Given the path to a local artifact folder, returns the list of files in that folder that
       * would be pushed when invoking the pushArtifact endpoint.
       */
      .addRpcEndpoint("getLocalArtifactFiles", {
        parameter: z.object({
          path: z.string(),
        }),
        returns: z.object({
          fileList: localArtifactFileListSchema,
        }),
      })
      .addChannelEndpoint("pushArtifact", {
        creationParameter: z.object({
          path: z.string(),
          description: z.string().max(1000).optional(),
          /**
           * Request to make the artifact private. Only effective if the artifact did not exist
           * before. Will not change the visibility of an existing artifact.
           */
          makePrivate: z.boolean().optional(),
          /**
           * If true, will write the revision number of the artifact after the push back to the
           * artifact manifest.json.
           */
          writeRevision: z.boolean().optional(),
          overrides: jsonSerializableSchema.optional(),
        }),
        toServerPacket: z.void(),
        toClientPacket: z.discriminatedUnion("type", [
          z.object({
            type: z.literal("message"),
            message: z.string(),
          }),
        ]),
      })
      .addRpcEndpoint("isAuthenticated", {
        parameter: z.void(),
        returns: z.object({
          authenticated: z.boolean(),
        }),
      })
      .addChannelEndpoint("ensureAuthenticated", {
        creationParameter: z.void(),
        toServerPacket: z.void(),
        toClientPacket: z.discriminatedUnion("type", [
          z.object({
            type: z.literal("authenticationCode"),
            /**
             * The code to enter.
             */
            code: z.string(),
            /**
             * The URL for user to manually enter the code.
             */
            manualUrl: z.string(),
            /**
             * The URL that will be automatically filled.
             */
            filledUrl: z.string(),
          }),
          z.object({
            type: z.literal("authenticated"),
          }),
        ]),
      })
      /**
       * Gets the current authentication status.
       */
      .addRpcEndpoint("getAuthenticationStatus", {
        parameter: z.void(),
        returns: z.object({
          /**
           * Null if not authenticated.
           */
          authenticationStatus: authenticationStatusSchema.nullable(),
        }),
      })
      .addRpcEndpoint("deauthenticate", {
        parameter: z.void(),
        returns: z.void(),
      })
      .addRpcEndpoint("loginWithPreAuthenticatedKeys", {
        parameter: z.object({
          keyId: z.string(),
          publicKey: z.string(),
          privateKey: z.string(),
        }),
        returns: z.object({
          userName: z.string(),
        }),
      })
      /**
       * Creates a download plan. The target can either be an artifact root or a direct model root.
       */
      .addChannelEndpoint("createDownloadPlan", {
        creationParameter: z.object({
          target: repositoryDownloadPlannerTargetSchema,
          opts: repositoryDownloadPlannerOptsSchema.optional(),
        }),
        toServerPacket: z.discriminatedUnion("type", [
          /**
           * Cancels the download.
           */
          z.object({
            type: z.literal("cancelDownload"),
          }),
          /**
           * Updates the selected concrete model download option for a resolved model node.
           *
           * `requestedPlanVersion` identifies the client selection change that should be reflected
           * in the next emitted plan version.
           */
          z.object({
            type: z.literal("setSelectedDownloadOptionIndex"),
            nodeIndex: z.number().int(),
            selectedDownloadOptionIndex: z.number().int().nullable(),
            requestedPlanVersion: z.number().int(),
          }),
          /**
           * Can only be called after plan ready. Once called, starts the plan.
           */
          z.object({
            type: z.literal("commit"),
          }),
          /**
           * Aborts the plan.
           */
          z.object({
            type: z.literal("cancelPlan"),
          }),
        ]),
        toClientPacket: z.discriminatedUnion("type", [
          z.object({
            type: z.literal("planUpdated"),
            plan: artifactDownloadPlanSchema,
          }),
          z.object({
            type: z.literal("planReady"),
            plan: artifactDownloadPlanSchema,
          }),
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
      })
      /**
       * Install a plugin that exists in a local folder. It will be installed as if it is downloaded
       * from the LM Studio Hub.
       */
      .addRpcEndpoint("installLocalPlugin", {
        parameter: z.object({
          pluginPath: z.string(),
        }),
        returns: z.void(),
      })
      .addRpcEndpoint("getModelCatalog", {
        parameter: z.void(),
        returns: z.object({
          models: z.array(hubModelSchema),
        }),
      })
      .addRpcEndpoint("fuzzyFindStaffPicks", {
        parameter: z.object({
          searchTerm: z.string().optional(),
          limit: z.number().int().positive().optional(),
          compatibilityTypes: z.array(modelCompatibilityTypeSchema).optional(),
        }),
        returns: z.object({
          results: z.array(fuzzyFindStaffPickResultSchema),
        }),
      })
      .addRpcEndpoint("lmLinkStatus", {
        parameter: z.void(),
        returns: lmLinkStatusResultSchema,
      })
      .addRpcEndpoint("lmLinkSetDisabled", {
        parameter: z.object({
          disabled: z.boolean(),
        }),
        returns: z.void(),
      })
      .addRpcEndpoint("lmLinkUpdateDeviceName", {
        parameter: z.object({
          deviceName: z.string(),
        }),
        returns: z.void(),
      })
      .addRpcEndpoint("lmLinkSetPreferredDevice", {
        parameter: z.object({
          deviceIdentifier: z.string(),
        }),
        returns: z.void(),
      })
      .addRpcEndpoint("lmLinkSetupComputeDevice", {
        parameter: z.object({
          setupCode: z.string().min(1),
        }),
        returns: lmLinkSetupComputeDeviceResultSchema,
      })
      .addRpcEndpoint("lmLinkDeSetupComputeDevice", {
        parameter: z.void(),
        returns: z.void(),
      })
  );
}

export type RepositoryPort = InferClientPort<typeof createRepositoryBackendInterface>;
export type RepositoryBackendInterface = ReturnType<typeof createRepositoryBackendInterface>;
