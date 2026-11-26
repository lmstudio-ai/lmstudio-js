import { z } from "zod";
import { artifactManifestBaseSchema, type ArtifactManifestBase } from "./ArtifactManifestBase.js";
import {
  type VirtualModelDefinitionDrafter,
  virtualModelDefinitionDrafterSchema,
} from "./VirtualModelDefinition.js";

/**
 * @public
 */
export interface ModelManifest extends ArtifactManifestBase {
  type: "model";
  /**
   * The model.yaml drafters. Kept out of `dependencies` so apps that don't know them don't download
   * them.
   */
  drafters?: Array<VirtualModelDefinitionDrafter>;
}
export const modelManifestSchema = z.object({
  type: z.literal("model"),
  ...artifactManifestBaseSchema.shape,
  drafters: z.array(virtualModelDefinitionDrafterSchema).optional(),
});
