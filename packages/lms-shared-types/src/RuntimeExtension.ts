import { z, type ZodSchema } from "zod";
import {
  type BaseSpecifier,
  baseSpecifierSchema,
  type CpuInfo,
  cpuInfoSchema,
  type GpuInfo,
  gpuInfoSchema,
  type ModelFormatName,
  modelFormatNameSchema,
} from "./RuntimeCommon.js";

/**
 * Uniquely specifies a Runtime Extension
 *
 * @public
 */
export interface RuntimeExtensionSpecifier extends BaseSpecifier {}
export const runtimeExtensionSpecifierSchema =
  baseSpecifierSchema as ZodSchema<RuntimeExtensionSpecifier>;

/**
 * Information about a Runtime Extension
 *
 * @public
 */
export interface RuntimeExtensionInfoBase {
  name: string;
  version: string;
  package: string;
  platform: string;
  cpu: CpuInfo;
  gpu?: GpuInfo;
}
export const runtimeExtensionSpecifierSchemaBase = baseSpecifierSchema.extend({
  package: z.string(),
  platform: z.string(),
  cpu: cpuInfoSchema,
  gpu: gpuInfoSchema.optional(),
});

export interface RuntimeEngineExtensionInfo extends RuntimeExtensionInfoBase {
  type: "engine";
  supportedModelFormatNames: Array<ModelFormatName>;
}
export const runtimeEngineExtensionInfoSchema = runtimeExtensionSpecifierSchemaBase.extend({
  type: z.literal("engine"),
  supportedModelFormatNames: z.array(modelFormatNameSchema),
});

export interface RuntimeFrameworkExtensionInfo extends RuntimeExtensionInfoBase {
  type: "framework";
}
export const runtimeFrameworkExtensionInfoSchema = runtimeExtensionSpecifierSchemaBase.extend({
  type: z.literal("framework"),
});

export type RuntimeExtensionInfo = RuntimeEngineExtensionInfo | RuntimeFrameworkExtensionInfo;
export const runtimeExtensionInfoSchema = z.discriminatedUnion("type", [
  runtimeEngineExtensionInfoSchema,
  runtimeFrameworkExtensionInfoSchema,
]) as ZodSchema<RuntimeExtensionInfo>;

export interface DownloadableRuntimeExtensionInfoAdditionalFields {
  /**
   * If the extension is already installed, the local versions available.
   */
  localVersions: Array<string>;
}
export const downloadableRuntimeExtensionInfoAdditionalFieldsSchema = z.object({
  localVersions: z.array(z.string()),
});

export type DownloadableRuntimeEngineExtension = RuntimeEngineExtensionInfo &
  DownloadableRuntimeExtensionInfoAdditionalFields;
export const downloadableRuntimeEngineExtensionSchema = runtimeEngineExtensionInfoSchema.extend(
  downloadableRuntimeExtensionInfoAdditionalFieldsSchema.shape,
);

export type DownloadableRuntimeFrameworkExtension = RuntimeFrameworkExtensionInfo &
  DownloadableRuntimeExtensionInfoAdditionalFields;
export const downloadableRuntimeFrameworkExtensionSchema =
  runtimeFrameworkExtensionInfoSchema.extend(
    downloadableRuntimeExtensionInfoAdditionalFieldsSchema.shape,
  );

export type DownloadableRuntimeExtensionInfo =
  | DownloadableRuntimeEngineExtension
  | DownloadableRuntimeFrameworkExtension;
export const downloadableRuntimeExtensionInfoSchema = z.discriminatedUnion("type", [
  downloadableRuntimeEngineExtensionSchema,
  downloadableRuntimeFrameworkExtensionSchema,
]) as ZodSchema<DownloadableRuntimeExtensionInfo>;
