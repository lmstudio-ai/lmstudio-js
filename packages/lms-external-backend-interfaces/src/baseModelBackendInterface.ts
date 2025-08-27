import { type DeepReplaceType2 } from "@lmstudio/lms-common";
import { BackendInterface } from "@lmstudio/lms-communication";
import { type ClientPort } from "@lmstudio/lms-communication-client";
import {
  kvConfigSchema,
  kvConfigStackSchema,
  type ModelInfoBase,
  type ModelInstanceInfoBase,
  modelInstanceInfoSchema,
  modelProcessingStateSchema,
  modelSpecifierSchema,
} from "@lmstudio/lms-shared-types";
import { z, type ZodSchema } from "zod";

// Hack to allow search and replace parameterized types:
//
// We mark these types with a brand field so they cannot be mistaken for other types. Later, we use
// `DeepReplaceType2` to replace these types with concrete ModelInstanceInfo and ModelInfo types.
//
// It is very unfortunate that we have to do this. It is trying to work around the fact that
// TypeScript does not support higher order types.
type SpecificModelInstanceInfo = ModelInstanceInfoBase & { brand: true };
type SpecificModelInfo = ModelInfoBase & { brand: true };
/**
 * Create a base model backend interface that are used by all domain-specific model backend
 * interfaces.
 */
export function createBaseModelBackendInterface<
  TModelInstanceInfo extends ModelInstanceInfoBase,
  TModelInfoSchema extends ModelInfoBase,
>(
  specificModelInstanceInfoSchemaInput: ZodSchema<TModelInstanceInfo>,
  specificModelInfoSchemaInput: ZodSchema<TModelInfoSchema>,
) {
  const specificModelInstanceInfoSchema =
    specificModelInstanceInfoSchemaInput as any as ZodSchema<SpecificModelInstanceInfo>;
  const specificModelInfoSchema =
    specificModelInfoSchemaInput as any as ZodSchema<SpecificModelInfo>;
  return new BackendInterface()
    .addChannelEndpoint("loadModel", {
      creationParameter: z.object({
        modelKey: z.string(),
        identifier: z.string().optional(),
        /**
         * If provided, when the model is not used for this amount of time, it will be unloaded.
         */
        ttlMs: z.number().int().min(1).optional(),
        loadConfigStack: kvConfigStackSchema,
      }),
      toClientPacket: z.discriminatedUnion("type", [
        z.object({
          type: z.literal("resolved"),
          info: specificModelInfoSchema,
          ambiguous: z.array(z.string()).optional(),
        }),
        z.object({
          type: z.literal("progress"),
          progress: z.number(),
        }),
        z.object({
          type: z.literal("success"),
          info: specificModelInstanceInfoSchema,
        }),
      ]),
      toServerPacket: z.discriminatedUnion("type", [
        z.object({
          type: z.literal("cancel"),
        }),
      ]),
    })
    .addRpcEndpoint("unloadModel", {
      parameter: z.object({
        identifier: z.string(),
      }),
      returns: z.void(),
    })
    .addRpcEndpoint("listLoaded", {
      parameter: z.undefined(),
      returns: z.array(specificModelInstanceInfoSchema),
    })
    .addRpcEndpoint("getModelInfo", {
      parameter: z.object({
        specifier: modelSpecifierSchema,
        throwIfNotFound: z.boolean(),
      }),
      returns: specificModelInstanceInfoSchema.optional(),
    })
    .addRpcEndpoint("getLoadConfig", {
      parameter: z.object({
        specifier: modelSpecifierSchema,
      }),
      returns: kvConfigSchema,
    })
    .addChannelEndpoint("getOrLoad", {
      creationParameter: z.object({
        identifier: z.string(),
        /**
         * If provided and a new instance is loaded as a result of this call, it will be unloaded
         * after idling for this amount of time.
         */
        loadTtlMs: z.number().int().min(1).optional(),
        loadConfigStack: kvConfigStackSchema,
      }),
      toClientPacket: z.discriminatedUnion("type", [
        z.object({
          type: z.literal("alreadyLoaded"),
          info: specificModelInstanceInfoSchema,
        }),
        z.object({
          type: z.literal("startLoading"),
          identifier: z.string(),
          info: specificModelInfoSchema,
        }),
        z.object({
          // We are unloading other JIT model
          type: z.literal("unloadingOtherJITModel"),
          info: modelInstanceInfoSchema,
        }),
        z.object({
          type: z.literal("loadProgress"),
          progress: z.number(),
        }),
        z.object({
          type: z.literal("loadSuccess"),
          info: specificModelInstanceInfoSchema,
        }),
      ]),
      toServerPacket: z.discriminatedUnion("type", [
        z.object({
          type: z.literal("cancel"),
        }),
      ]),
    })
    .addRpcEndpoint("getInstanceProcessingState", {
      parameter: z.object({
        specifier: modelSpecifierSchema,
        throwIfNotFound: z.boolean(),
      }),
      returns: modelProcessingStateSchema,
    });
}

export type BaseModelPort<
  TModelInstanceInfo extends ModelInstanceInfoBase,
  TModelInfo extends ModelInfoBase,
> = typeof createBaseModelBackendInterface extends (
  ...args: any[]
) => BackendInterface<
  infer _RContext,
  infer RRpcEndpoints,
  infer RChannelEndpoints,
  infer RSignalEndpoints,
  infer RWritableSignalEndpoints
>
  ? ClientPort<
      DeepReplaceType2<
        RRpcEndpoints,
        SpecificModelInstanceInfo,
        TModelInstanceInfo,
        SpecificModelInfo,
        TModelInfo
      >,
      DeepReplaceType2<
        RChannelEndpoints,
        SpecificModelInstanceInfo,
        TModelInstanceInfo,
        SpecificModelInfo,
        TModelInfo
      >,
      DeepReplaceType2<
        RSignalEndpoints,
        SpecificModelInstanceInfo,
        TModelInstanceInfo,
        SpecificModelInfo,
        TModelInfo
      >,
      DeepReplaceType2<
        RWritableSignalEndpoints,
        SpecificModelInstanceInfo,
        TModelInstanceInfo,
        SpecificModelInfo,
        TModelInfo
      >
    >
  : never;
export type BaseModelBackendInterface<
  TModelInstanceInfo extends ModelInstanceInfoBase,
  TModelInfo extends ModelInfoBase,
> = typeof createBaseModelBackendInterface extends (
  ...args: any[]
) => BackendInterface<
  infer RContext,
  infer RRpcEndpoints,
  infer RChannelEndpoints,
  infer RSignalEndpoints,
  infer RWritableSignalEndpoints
>
  ? BackendInterface<
      RContext,
      DeepReplaceType2<
        RRpcEndpoints,
        SpecificModelInstanceInfo,
        TModelInstanceInfo,
        SpecificModelInfo,
        TModelInfo
      >,
      DeepReplaceType2<
        RChannelEndpoints,
        SpecificModelInstanceInfo,
        TModelInstanceInfo,
        SpecificModelInfo,
        TModelInfo
      >,
      DeepReplaceType2<
        RSignalEndpoints,
        SpecificModelInstanceInfo,
        TModelInstanceInfo,
        SpecificModelInfo,
        TModelInfo
      >,
      DeepReplaceType2<
        RWritableSignalEndpoints,
        SpecificModelInstanceInfo,
        TModelInstanceInfo,
        SpecificModelInfo,
        TModelInfo
      >
    >
  : never;
