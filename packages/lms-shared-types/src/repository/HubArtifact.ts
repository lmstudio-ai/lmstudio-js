import { z } from "zod";
import {
  type ModelCompatibilityType,
  modelCompatibilityTypeSchema,
} from "../ModelCompatibilityType";

export type HubArtifactBase = {
  /** Owner of the artifact */
  owner: string;
  /** Name of the artifact */
  name: string;
  /** Description of the artifact */
  description: string;
  /** Unix timestamp in ms when the artifact was created */
  createdAt: number;
  /** Number of downloads for the artifact */
  downloads: number;
  /** Number of likes the artifact has received */
  likeCount: number;
  /** Number of times the artifact has been forked */
  forkCount: number;
  /** Unix timestamp in ms when the artifact was staff picked, only defined if staff picked */
  staffPickedAt?: number;
  /** URL to the artifact */
  url: string;
  /** Revision number for the artifact */
  revisionNumber: number;
  /** Indicates if the artifact is private */
  isPrivate?: boolean;
  /** If forked, the original artifact in "owner/name" format */
  forkedFrom?: string;
};

export const hubArtifactBaseSchema = z.object({
  owner: z.string(),
  name: z.string(),
  description: z.string(),
  createdAt: z.number(),
  downloads: z.number(),
  likeCount: z.number(),
  forkCount: z.number(),
  staffPickedAt: z.number().optional(),
  url: z.string(),
  revisionNumber: z.number(),
  isPrivate: z.boolean().optional(),
  forkedFrom: z.string().optional(),
});

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

export type HubModel = HubArtifactBase & {
  type: "model";
  metadata: HubModelMetadata;
};

export const hubModelSchema = hubArtifactBaseSchema.extend({
  type: z.literal("model"),
  metadata: hubModelMetadataSchema,
});

export type HubPreset = HubArtifactBase & {
  type: "preset";
};

export const hubPresetSchema = hubArtifactBaseSchema.extend({
  type: z.literal("preset"),
});

export type HubPlugin = HubArtifactBase & {
  type: "plugin";
};

export const hubPluginSchema = hubArtifactBaseSchema.extend({
  type: z.literal("plugin"),
});

export type HubArtifact = HubModel | HubPreset | HubPlugin;

export const hubArtifactSchema = z.discriminatedUnion("type", [
  hubModelSchema,
  hubPresetSchema,
  hubPluginSchema,
]);
