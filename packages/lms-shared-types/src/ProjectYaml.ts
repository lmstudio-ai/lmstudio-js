import { z, type ZodSchema } from "zod";
import { artifactIdentifierRegex } from "./ArtifactManifestBase.js";
import { artifactTypeSchema, type ArtifactType } from "./ArtifactManifest.js";

export interface ProjectYamlArtifactEntry {
  identifier: string; // owner/name
  type: ArtifactType; // includes "project"
  revision?: number | "latest";
  required?: boolean;
  notes?: string;
}

export const projectYamlArtifactEntrySchema: ZodSchema<ProjectYamlArtifactEntry> = z.object({
  identifier: z.string().regex(artifactIdentifierRegex),
  type: artifactTypeSchema,
  revision: z.union([z.number().int().positive(), z.literal("latest")]).optional(),
  required: z.boolean().optional(),
  notes: z.string().optional(),
});

export interface ProjectYaml {
  version: number;
  artifacts: Record<string, ProjectYamlArtifactEntry>;
}

export const projectYamlSchema: ZodSchema<ProjectYaml> = z.object({
  version: z.number().int().positive(),
  artifacts: z.record(projectYamlArtifactEntrySchema),
});

