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
 * Uniquely specifies a runtime engine.
 *
 * @public
 * @deprecated [DEP-LEGACY-RUNTIME-ENGINE] This API is part of the legacy runtime engine API that
 * was never stablized, but used in the lms-cli. This API will be removed as we move the
 * functionality into `client.runtime.extensions`. You may use this API but expect breakage even
 * during minor updates.
 */
export interface RuntimeEngineSpecifier extends BaseSpecifier {}

// Keep the original schema without casting for extending
const runtimeEngineSpecifierSchemaBase = baseSpecifierSchema;

// Export with type assertion when needed
export const runtimeEngineSpecifierSchema =
  runtimeEngineSpecifierSchemaBase as ZodSchema<RuntimeEngineSpecifier>;

/**
 * Information about a runtime engine.
 *
 * @public
 * @deprecated [DEP-LEGACY-RUNTIME-ENGINE] This API is part of the legacy runtime engine API that
 * was never stablized, but used in the lms-cli. This API will be removed as we move the
 * functionality into `client.runtime.extensions`. You may use this API but expect breakage even
 * during minor updates.
 */
export interface RuntimeEngineInfo extends RuntimeEngineSpecifier {
  engine: string;
  platform: string;
  cpu: CpuInfo;
  gpu?: GpuInfo;
  supportedModelFormatNames: ModelFormatName[];
}
export const runtimeEngineInfoSchema = runtimeEngineSpecifierSchemaBase.extend({
  engine: z.string(),
  platform: z.string(),
  cpu: cpuInfoSchema,
  gpu: gpuInfoSchema.optional(),
  supportedModelFormatNames: z.array(modelFormatNameSchema),
}) as ZodSchema<RuntimeEngineInfo>;

/**
 * Map of a model format to a selected runtime engine.
 *
 * @public
 * @deprecated [DEP-LEGACY-RUNTIME-ENGINE] This API is part of the legacy runtime engine API that
 * was never stablized, but used in the lms-cli. This API will be removed as we move the
 * functionality into `client.runtime.extensions`. You may use this API but expect breakage even
 * during minor updates.
 */
export type SelectedRuntimeEngineMap = Map<ModelFormatName, RuntimeEngineSpecifier>;
export const selectedRuntimeEngineMapSchema = z.map(
  modelFormatNameSchema,
  runtimeEngineSpecifierSchema,
);
