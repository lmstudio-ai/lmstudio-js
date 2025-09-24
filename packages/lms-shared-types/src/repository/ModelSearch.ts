import { z, type ZodSchema } from "zod";
import {
  modelCompatibilityTypeSchema,
  type ModelCompatibilityType,
} from "../ModelCompatibilityType.js";

/**
 * @public
 */
export type ModelSearchResultDownloadOptionFitEstimation =
  | "fullGPUOffload"
  | "partialGPUOffload"
  | "fitWithoutGPU"
  | "willNotFit";
export const modelSearchResultDownloadOptionFitEstimationSchema = z.enum([
  "fullGPUOffload",
  "partialGPUOffload",
  "fitWithoutGPU",
  "willNotFit",
]) as ZodSchema<ModelSearchResultDownloadOptionFitEstimation>;

export interface ModelSearchResultDownloadOptionData {
  quantization?: string;
  name: string;
  sizeBytes: number;
  fitEstimation: ModelSearchResultDownloadOptionFitEstimation;
  recommended?: boolean;
  downloadIdentifier: string;
  indexedModelIdentifier: string;
  compatibilityType: ModelCompatibilityType;
}
export const modelSearchResultDownloadOptionDataSchema = z.object({
  quantization: z.string().optional(),
  name: z.string(),
  sizeBytes: z.number().int(),
  fitEstimation: modelSearchResultDownloadOptionFitEstimationSchema,
  recommended: z.boolean().optional(),
  downloadIdentifier: z.string(),
  indexedModelIdentifier: z.string(),
  compatibilityType: modelCompatibilityTypeSchema,
}) as ZodSchema<ModelSearchResultDownloadOptionData>;

export type ModelSearchResultIdentifier =
  | {
      type: "catalog";
      identifier: string;
    }
  | {
      type: "hf";
      identifier: string;
    };
export const modelSearchResultIdentifierSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("catalog"),
    identifier: z.string(),
  }),
  z.object({
    type: z.literal("hf"),
    identifier: z.string(),
  }),
]) as ZodSchema<ModelSearchResultIdentifier>;

export interface ModelSearchResultEntryData {
  name: string;
  identifier: ModelSearchResultIdentifier;
  exact?: boolean;
  staffPick?: boolean;
}
export const modelSearchResultEntryDataSchema = z.object({
  name: z.string(),
  identifier: modelSearchResultIdentifierSchema,
  exact: z.boolean().optional(),
  staffPick: z.boolean().optional(),
}) as ZodSchema<ModelSearchResultEntryData>;

/** @public */
export interface ModelSearchOpts {
  /**
   * The search term to use when searching for models. If not provided, recommended models will
   * be returned.
   */
  searchTerm?: string;
  /**
   * How many results to return. If not provided, this value will be decided by LM Studio.
   */
  limit?: number;
  /**
   * The model compatibility types to filter by. If not provided, only models that are supported
   * by your current runtimes will be returned.
   */
  compatibilityTypes?: Array<ModelCompatibilityType>;
}
export const modelSearchOptsSchema = z.object({
  searchTerm: z.string().optional(),
  limit: z.number().int().positive().max(25).optional(),
  compatibilityTypes: z.array(modelCompatibilityTypeSchema).optional(),
}) as ZodSchema<ModelSearchOpts>;
