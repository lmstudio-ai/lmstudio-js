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
 * Uniquely specifies a runtime extension.
 *
 * @public
 * @experimental [EXP-RUNTIME-EXTENSION] Runtime extensions related APIs are experimental and may
 * change in the future.
 */
export interface RuntimeExtensionSpecifier extends BaseSpecifier {}
export const runtimeExtensionSpecifierSchema =
  baseSpecifierSchema as ZodSchema<RuntimeExtensionSpecifier>;

/**
 * Common fields for runtime extension info.
 *
 * @public
 * @experimental [EXP-RUNTIME-EXTENSION] Runtime extensions related APIs are experimental and may
 * change in the future.
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

/**
 * Runtime extension info for engine extensions.
 *
 * @public
 * @experimental [EXP-RUNTIME-EXTENSION] Runtime extensions related APIs are experimental and may
 * change in the future.
 */
export interface RuntimeEngineExtensionInfo extends RuntimeExtensionInfoBase {
  type: "engine";
  supportedModelFormatNames: Array<ModelFormatName>;
}
export const runtimeEngineExtensionInfoSchema = runtimeExtensionSpecifierSchemaBase.extend({
  type: z.literal("engine"),
  supportedModelFormatNames: z.array(modelFormatNameSchema),
});

/**
 * Runtime extension info for framework extensions.
 *
 * @public
 * @experimental [EXP-RUNTIME-EXTENSION] Runtime extensions related APIs are experimental and may
 * change in the future.
 */
export interface RuntimeFrameworkExtensionInfo extends RuntimeExtensionInfoBase {
  type: "framework";
}
export const runtimeFrameworkExtensionInfoSchema = runtimeExtensionSpecifierSchemaBase.extend({
  type: z.literal("framework"),
});

/**
 * Runtime extension info, either engine or framework.
 *
 * @public
 * @experimental [EXP-RUNTIME-EXTENSION] Runtime extensions related APIs are experimental and may
 * change in the future.
 */
export type RuntimeExtensionInfo = RuntimeEngineExtensionInfo | RuntimeFrameworkExtensionInfo;
export const runtimeExtensionInfoSchema = z.discriminatedUnion("type", [
  runtimeEngineExtensionInfoSchema,
  runtimeFrameworkExtensionInfoSchema,
]) as ZodSchema<RuntimeExtensionInfo>;

/**
 * Extra fields exposed for downloadable runtime extensions.
 *
 * @public
 * @experimental [EXP-RUNTIME-EXTENSION] Runtime extensions related APIs are experimental and may
 * change in the future.
 */
export interface DownloadableRuntimeExtensionInfoAdditionalFields {
  /**
   * If the extension is already installed, the local versions available.
   */
  localVersions: Array<string>;
}
export const downloadableRuntimeExtensionInfoAdditionalFieldsSchema = z.object({
  localVersions: z.array(z.string()),
});

/**
 * Downloadable engine extension info.
 *
 * @public
 * @experimental [EXP-RUNTIME-EXTENSION] Runtime extensions related APIs are experimental and may
 * change in the future.
 */
export type DownloadableRuntimeEngineExtension = RuntimeEngineExtensionInfo &
  DownloadableRuntimeExtensionInfoAdditionalFields;
export const downloadableRuntimeEngineExtensionSchema = runtimeEngineExtensionInfoSchema.extend(
  downloadableRuntimeExtensionInfoAdditionalFieldsSchema.shape,
);

/**
 * Downloadable framework extension info.
 *
 * @public
 * @experimental [EXP-RUNTIME-EXTENSION] Runtime extensions related APIs are experimental and may
 * change in the future.
 */
export type DownloadableRuntimeFrameworkExtension = RuntimeFrameworkExtensionInfo &
  DownloadableRuntimeExtensionInfoAdditionalFields;
export const downloadableRuntimeFrameworkExtensionSchema =
  runtimeFrameworkExtensionInfoSchema.extend(
    downloadableRuntimeExtensionInfoAdditionalFieldsSchema.shape,
  );

/**
 * Downloadable runtime extension info, either engine or framework.
 *
 * @public
 * @experimental [EXP-RUNTIME-EXTENSION] Runtime extensions related APIs are experimental and may
 * change in the future.
 */
export type DownloadableRuntimeExtensionInfo =
  | DownloadableRuntimeEngineExtension
  | DownloadableRuntimeFrameworkExtension;
export const downloadableRuntimeExtensionInfoSchema = z.discriminatedUnion("type", [
  downloadableRuntimeEngineExtensionSchema,
  downloadableRuntimeFrameworkExtensionSchema,
]) as ZodSchema<DownloadableRuntimeExtensionInfo>;
