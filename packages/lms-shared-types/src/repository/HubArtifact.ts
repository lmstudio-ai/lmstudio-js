import { z } from "zod";
import {
  type ModelCompatibilityType,
  modelCompatibilityTypeSchema,
} from "../ModelCompatibilityType.js";

/**
 * Represents information about the base properties of an artifact in the Hub.
 *
 * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development. Stay
 * tuned for updates.
 * @public
 */
export type HubArtifactBase = {
  /** Owner of the artifact */
  owner: string;
  /** Name of the artifact */
  name: string;
  /** Number of downloads for the artifact */
  downloads: number;
  /** Number of likes the artifact has received */
  likeCount: number;
  /** Unix timestamp in ms when the artifact was staff picked, only defined if staff picked */
  staffPickedAt?: number;
};
export const hubArtifactBaseSchema = z.object({
  owner: z.string(),
  name: z.string(),
  downloads: z.number(),
  likeCount: z.number(),
  staffPickedAt: z.number().optional(),
});

/**
 * Represents shared metadata properties for models in the Hub.
 *
 * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development. Stay
 * tuned for updates.
 * @public
 */
export interface HubModelSharedMetadata {
  architectures: Array<string>;
  compatibilityTypes: Array<ModelCompatibilityType>;
  paramsStrings: Array<string>;
  minMemoryUsageBytes: number;
}
export const hubModelSharedMetadataSchema = z.object({
  architectures: z.array(z.string()),
  compatibilityTypes: z.array(modelCompatibilityTypeSchema),
  paramsStrings: z.array(z.string()),
  minMemoryUsageBytes: z.number(),
});

/**
 * Represents metadata for models in the Hub.
 *
 * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development. Stay
 * tuned for updates.
 * @public
 */
export type HubModelMetadata =
  | ({
      type: "llm";
      trainedForToolUse: boolean | "mixed";
      vision: boolean | "mixed";
      reasoning: boolean | "mixed";
      contextLengths: Array<number>;
    } & HubModelSharedMetadata)
  | ({
      type: "embedding";
      contextLengths: Array<number>;
    } & HubModelSharedMetadata);
export const hubModelMetadataSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("llm"),
    ...hubModelSharedMetadataSchema.shape,
    trainedForToolUse: z.union([z.boolean(), z.literal("mixed")]),
    vision: z.union([z.boolean(), z.literal("mixed")]),
    reasoning: z.union([z.boolean(), z.literal("mixed")]),
    contextLengths: z.array(z.number()),
  }),
  z.object({
    type: z.literal("embedding"),
    ...hubModelSharedMetadataSchema.shape,
    contextLengths: z.array(z.number()),
  }),
]);

/**
 * Represents a model artifact in the Hub.
 *
 * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development. Stay
 * tuned for updates.
 * @public
 */
export type HubModel = HubArtifactBase & {
  type: "model";
  metadata: HubModelMetadata;
};
export const hubModelSchema = hubArtifactBaseSchema.extend({
  type: z.literal("model"),
  metadata: hubModelMetadataSchema,
});
/**
 * Represents an artifact in the Hub, which can be a model, preset, or plugin.
 *
 * @deprecated [DEP-HUB-API-ACCESS] LM Studio Hub API access is still in active development. Stay
 * tuned for updates.
 * @public
 */
export type HubArtifact = HubModel;
export const hubArtifactSchema = z.discriminatedUnion("type", [hubModelSchema]);
