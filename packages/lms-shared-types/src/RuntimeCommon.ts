import { z } from "zod";

/**
 * Supported model formats
 *
 * @public
 */
export type ModelFormatName = "GGUF" | "MLX" | "GGML" | "PT";
export const modelFormatNameSchema = z.enum(["GGUF", "MLX", "GGML", "PT"]);

/**
 * Common CPU information structure
 *
 * @public
 */
export interface CpuInfo {
  architecture: string;
  instructionSetExtensions?: string[];
}

export const cpuInfoSchema = z.object({
  architecture: z.string(),
  instructionSetExtensions: z.array(z.string()).optional(),
});

/**
 * Common GPU information structure
 *
 * @public
 */
export interface GpuInfo {
  make?: string;
  framework?: string;
}

export const gpuInfoSchema = z.object({
  make: z.string().optional(),
  framework: z.string().optional(),
});

/**
 * Base specifier with name and version
 *
 * @public
 */
export interface BaseSpecifier {
  name: string;
  version: string;
}

export const baseSpecifierSchema = z.object({
  name: z.string(),
  version: z.string(),
});
