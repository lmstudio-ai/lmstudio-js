import { z } from "zod";
import { artifactManifestBaseSchema, type ArtifactManifestBase } from "./ArtifactManifestBase.js";

/**
 * @public
 */
export interface ProjectManifest extends ArtifactManifestBase {
  type: "project";
}

export const projectManifestSchema = z.object({
  type: z.literal("project"),
  ...artifactManifestBaseSchema.shape,
});
