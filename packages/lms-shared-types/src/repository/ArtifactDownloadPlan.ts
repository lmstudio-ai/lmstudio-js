import { z, type ZodSchema } from "zod";
import { artifactTypeSchema, type ArtifactType } from "../ArtifactManifest.js";
import { kebabCaseSchema, kebabCaseWithDotsSchema } from "../kebab.js";
import {
  modelCompatibilityTypeSchema,
  type ModelCompatibilityType,
} from "../ModelCompatibilityType.js";
import {
  modelSearchResultDownloadOptionFitEstimationSchema,
  type ModelSearchResultDownloadOptionFitEstimation,
} from "./ModelSearch.js";

/**
 * Represents information about a model in an artifact download plan.
 *
 * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development. Stay
 * tuned for updates.
 * @public
 */
export type ArtifactDownloadPlanModelInfo = {
  displayName: string;
  sizeBytes: number;
  quantName?: string;
  compatibilityType: ModelCompatibilityType;
  modelKey?: string;
};
export const artifactDownloadPlanModelInfoSchema: ZodSchema<ArtifactDownloadPlanModelInfo> =
  z.object({
    displayName: z.string(),
    sizeBytes: z.number(),
    quantName: z.string().optional(),
    compatibilityType: modelCompatibilityTypeSchema,
    modelKey: z.string().optional(),
  });

/**
 * Represents the availability of a selectable concrete model download option.
 *
 * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development. Stay
 * tuned for updates.
 * @public
 */
export type ArtifactDownloadPlanDownloadOptionAvailability =
  | "notDownloaded"
  | "downloading"
  | "downloaded";
export const artifactDownloadPlanDownloadOptionAvailabilitySchema: ZodSchema<ArtifactDownloadPlanDownloadOptionAvailability> =
  z.enum(["notDownloaded", "downloading", "downloaded"]);

/**
 * Represents a selectable download option for a concrete model in an artifact download plan.
 *
 * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development. Stay
 * tuned for updates.
 * @public
 */
export type ArtifactDownloadPlanDownloadOptionInfo = {
  displayName: string;
  sizeBytes: number;
  quantName?: string;
  compatibilityType: ModelCompatibilityType;
  fitEstimation: ModelSearchResultDownloadOptionFitEstimation;
  availability: ArtifactDownloadPlanDownloadOptionAvailability;
  recommended?: boolean;
};
export const artifactDownloadPlanDownloadOptionInfoSchema: ZodSchema<ArtifactDownloadPlanDownloadOptionInfo> =
  z.object({
    displayName: z.string(),
    sizeBytes: z.number(),
    quantName: z.string().optional(),
    compatibilityType: modelCompatibilityTypeSchema,
    fitEstimation: modelSearchResultDownloadOptionFitEstimationSchema,
    availability: artifactDownloadPlanDownloadOptionAvailabilitySchema,
    recommended: z.boolean().optional(),
  });

/**
 * Represents the state of a node in an artifact download plan.
 *
 * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development. Stay
 * tuned for updates.
 * @public
 */
export type ArtifactDownloadPlanNodeState = "pending" | "fetching" | "satisfied" | "completed";
export const artifactDownloadPlanNodeStateSchema: ZodSchema<ArtifactDownloadPlanNodeState> = z.enum(
  ["pending", "fetching", "satisfied", "completed"],
);

/**
 * Represents the state of a node in an artifact download plan.
 *
 * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development. Stay
 * tuned for updates.
 * @public
 */
export type ArtifactDownloadPlanNode =
  | {
      type: "artifact";
      owner: string;
      name: string;
      state: ArtifactDownloadPlanNodeState;
      artifactType?: ArtifactType;
      sizeBytes?: number;
      dependencyNodes: Array<number>;
    }
  | {
      type: "model";
      state: ArtifactDownloadPlanNodeState;
      dependencyLabel: string;
      resolvedSources?: number;
      totalSources?: number;
      alreadyOwned?: ArtifactDownloadPlanModelInfo;
      selected?: ArtifactDownloadPlanModelInfo;
      downloadOptions?: Array<ArtifactDownloadPlanDownloadOptionInfo>;
      selectedDownloadOptionIndex?: number | null;
      recommendedDownloadOptionIndex?: number | null;
    };
export const artifactDownloadPlanNodeSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("artifact"),
    owner: kebabCaseSchema,
    name: kebabCaseWithDotsSchema,
    state: artifactDownloadPlanNodeStateSchema,
    artifactType: artifactTypeSchema.optional(),
    sizeBytes: z.number().int().optional(),
    dependencyNodes: z.array(z.number().int()),
  }),
  z.object({
    type: z.literal("model"),
    state: artifactDownloadPlanNodeStateSchema,
    dependencyLabel: z.string(),
    resolvedSources: z.number().int().optional(),
    totalSources: z.number().int().optional(),
    alreadyOwned: artifactDownloadPlanModelInfoSchema.optional(),
    selected: artifactDownloadPlanModelInfoSchema.optional(),
    downloadOptions: z.array(artifactDownloadPlanDownloadOptionInfoSchema).optional(),
    selectedDownloadOptionIndex: z.number().int().nullable().optional(),
    recommendedDownloadOptionIndex: z.number().int().nullable().optional(),
  }),
]);

/**
 * Describes what will happen if the current plan is committed.
 *
 * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development. Stay
 * tuned for updates.
 * @public
 */
export type ArtifactDownloadPlanDownloadAction =
  | "none"
  | "startNewDownload"
  | "attachToExistingDownload";
export const artifactDownloadPlanDownloadActionSchema: ZodSchema<ArtifactDownloadPlanDownloadAction> =
  z.enum(["none", "startNewDownload", "attachToExistingDownload"]);

/**
 * Represents a plan for downloading artifacts.
 *
 * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development. Stay
 * tuned for updates.
 * @public
 */
export interface ArtifactDownloadPlan {
  nodes: Array<ArtifactDownloadPlanNode>;
  downloadSizeBytes: number;
  /**
   * What will happen if the current plan is committed.
   */
  downloadAction: ArtifactDownloadPlanDownloadAction;
  /**
   * Exact download job identifier for the current resolved selection, when the plan is submit-ready.
   */
  downloadJobIdentifier?: string;
  /**
   * Version of the client-driven selection state.
   *
   * This only changes when the client updates a resolved model-node selection. Background plan
   * refreshes keep the current version unchanged.
   */
  version: number;
}
export const artifactDownloadPlanSchema = z.object({
  nodes: z.array(artifactDownloadPlanNodeSchema),
  downloadSizeBytes: z.number().int(),
  downloadAction: artifactDownloadPlanDownloadActionSchema,
  downloadJobIdentifier: z.string().optional(),
  version: z.number().int(),
});
