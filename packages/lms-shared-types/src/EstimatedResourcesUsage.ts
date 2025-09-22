import { z, type ZodSchema } from "zod";

export type EstimatedModelMemoryUsageConfidence = "high" | "low";
export const estimatedModelMemoryUsageConfidenceSchema = z.enum([
  "high",
  "low",
]) as ZodSchema<EstimatedModelMemoryUsageConfidence>;

/**
 * Represents the estimate memory usage of a model.
 *
 * @experimental [EXP-MODEL-USAGE-ESTIMATION] Estimating model usage is experimental and may change
 * in the future.
 */
export interface EstimatedModelMemoryUsage {
  /**
   * Confidence level of the estimate.
   *
   * - "high" means we are relatively certain about the estimate and the estimate can be presented
   *   to the user
   * - "low" means we are not certain about the estimate due to certain heuristics not applicable.
   */
  confidence: "high" | "low";

  /**
   * Estimated total VRAM usage in bytes for the model.
   */
  modelVramBytes: number;
  /**
   * Estimated total VRAM usage in bytes for the context.
   */
  contextVramBytes: number;
  /**
   * Estimated total VRAM usage in bytes for both model and context.
   *
   * = modelVramBytes + contextVramBytes
   */
  totalVramBytes: number;

  /**
   * Estimated total memory usage in bytes for the model.
   */
  modelBytes: number;
  /**
   * Estimated total memory usage in bytes for the context.
   */
  contextBytes: number;
  /**
   * Estimated total memory usage in bytes for both model and context.
   *
   * = modelBytes + contextBytes
   */
  totalBytes: number;
}
export const estimatedModelMemoryUsageSchema: ZodSchema<EstimatedModelMemoryUsage> = z.object({
  confidence: estimatedModelMemoryUsageConfidenceSchema,
  modelVramBytes: z.number(),
  contextVramBytes: z.number(),
  totalVramBytes: z.number(),
  modelBytes: z.number(),
  contextBytes: z.number(),
  totalBytes: z.number(),
}) as ZodSchema<EstimatedModelMemoryUsage>;

/**
 * Represents the estimated resource usage of a model.
 *
 * @experimental [EXP-MODEL-USAGE-ESTIMATION] Estimating model usage is experimental and may change
 * in the future.
 */
export interface EstimatedResourcesUsage {
  /**
   * Information about estimated memory usage of the model.
   */
  memory: EstimatedModelMemoryUsage;
  /**
   * Whether the model can be loaded with the current guardrail settings.
   */
  passesGuardrails: boolean;
}
export const estimatedResourcesUsageSchema: ZodSchema<EstimatedResourcesUsage> = z.object({
  memory: estimatedModelMemoryUsageSchema,
  passesGuardrails: z.boolean(),
}) as ZodSchema<EstimatedResourcesUsage>;
