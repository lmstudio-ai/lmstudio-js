import { z, type ZodSchema } from "zod";

/**
 * Supported model formats
 *
 * @public
 */
export type ModelFormatName = "GGUF" | "MLX" | "GGML";

export const modelFormatNameSchema = z.enum(["GGUF", "MLX", "GGML"]);

/**
 * Uniquely specifies a Runtime Engine
 *
 * @public
 */
export interface RuntimeEngineSpecifier {
  name: string;
  version: string;
}
// Keep the original schema without casting for extending
const runtimeEngineSpecifierSchemaBase = z.object({
  name: z.string(),
  version: z.string(),
});

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
  cpu: {
    architecture: string;
    instructionSetExtensions?: string[];
  };
  gpu?: {
    make?: string;
    framework?: string;
  };
  supportedModelFormatNames: ModelFormatName[];
}
export const runtimeEngineInfoSchema = runtimeEngineSpecifierSchemaBase.extend({
  engine: z.string(),
  platform: z.string(),
  cpu: z.object({
    architecture: z.string(),
    instructionSetExtensions: z.array(z.string()).optional(),
  }),
  gpu: z
    .object({
      make: z.string().optional(),
      framework: z.string().optional(),
    })
    .optional(),
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
