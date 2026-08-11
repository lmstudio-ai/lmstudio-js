import { z } from "zod";
import { artifactManifestBaseSchema, type ArtifactManifestBase } from "./ArtifactManifestBase.js";

/**
 * Describes a skill artifact stored in LM Studio Hub.
 *
 * @public
 */
export interface SkillManifest extends ArtifactManifestBase {
  type: "skill";
}

export const skillManifestSchema = z.object({
  type: z.literal("skill"),
  ...artifactManifestBaseSchema.shape,
});
