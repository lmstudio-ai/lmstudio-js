import { z, type ZodSchema } from "zod";
import { artifactTypeSchema, type ArtifactType } from "../ArtifactManifest.js";
import { kebabCaseSchema, kebabCaseWithDotsSchema } from "../kebab.js";
import {
  modelCompatibilityTypeSchema,
  type ModelCompatibilityType,
} from "../ModelCompatibilityType.js";

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
};
export const artifactDownloadPlanModelInfoSchema: ZodSchema<ArtifactDownloadPlanModelInfo> =
  z.object({
    displayName: z.string(),
    sizeBytes: z.number(),
    quantName: z.string().optional(),
    compatibilityType: modelCompatibilityTypeSchema,
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
      resolvedSources?: number;
      totalSources?: number;
      alreadyOwned?: ArtifactDownloadPlanModelInfo;
      selected?: ArtifactDownloadPlanModelInfo;
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
    resolvedSources: z.number().int().optional(),
    totalSources: z.number().int().optional(),
    alreadyOwned: artifactDownloadPlanModelInfoSchema.optional(),
    selected: artifactDownloadPlanModelInfoSchema.optional(),
  }),
]);

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
}
export const artifactDownloadPlanSchema = z.object({
  nodes: z.array(artifactDownloadPlanNodeSchema),
  downloadSizeBytes: z.number().int(),
});
