import { z } from "zod";
import { artifactManifestBaseSchema, type ArtifactManifestBase } from "./ArtifactManifestBase.js";

/**
 * @public
 */
export interface ModelManifest extends ArtifactManifestBase {
  type: "model";
}
export const modelManifestSchema = z.object({
  type: z.literal("model"),
  ...artifactManifestBaseSchema.shape,
});
