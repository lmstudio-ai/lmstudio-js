import { z } from "zod";
import { artifactManifestBaseSchema, type ArtifactManifestBase } from "./ArtifactManifestBase.js";

/**
 * @public
 */
export interface ModelManifest extends ArtifactManifestBase {
  type: "model";
  virtual: true;
}
export const modelManifestSchema = z.object({
  type: z.literal("model"),
  virtual: z.literal(true),
  ...artifactManifestBaseSchema.shape,
});
