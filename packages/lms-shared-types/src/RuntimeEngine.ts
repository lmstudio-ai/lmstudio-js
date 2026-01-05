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
 * Uniquely specifies a Runtime Engine
 *
 * @public
 */
export interface RuntimeEngineSpecifier extends BaseSpecifier {}

// Keep the original schema without casting for extending
const runtimeEngineSpecifierSchemaBase = baseSpecifierSchema;

// Export with type assertion when needed
export const runtimeEngineSpecifierSchema =
  runtimeEngineSpecifierSchemaBase as ZodSchema<RuntimeEngineSpecifier>;

/**
 * Information about a Runtime Engine
 *
 * @public
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
 * Map of a ModelFormatName to a RuntimeEngineSpecifier
 *
 * @public
 */
export type SelectedRuntimeEngineMap = Map<ModelFormatName, RuntimeEngineSpecifier>;
export const selectedRuntimeEngineMapSchema = z.map(
  modelFormatNameSchema,
  runtimeEngineSpecifierSchema,
);
