import { z, type ZodSchema } from "zod";
import { artifactIdentifierRegex } from "./ArtifactManifestBase.js";
import { artifactTypeSchema, type ArtifactType } from "./ArtifactManifest.js";

export interface ProjectYamlArtifactEntry {
  identifier: string; // owner/name
}

export const projectYamlArtifactEntrySchema: ZodSchema<ProjectYamlArtifactEntry> = z.object({
  identifier: z.string().regex(artifactIdentifierRegex),
});

export interface ProjectYaml {
  artifacts: ProjectYamlArtifactEntry[];
}

export const projectYamlSchema: ZodSchema<ProjectYaml> = z.object({
  artifacts: z.array(projectYamlArtifactEntrySchema),
});
