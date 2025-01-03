import { z } from "zod";
import { artifactManifestBaseSchema, type ArtifactManifestBase } from "./ArtifactManifestBase.js";

/**
 * @public
 */
export type PluginRunnerType = "ecmascript";
export const pluginRunnerTypeSchema = z.enum(["ecmascript"]);

/**
 * @public
 */
export interface PluginManifest extends ArtifactManifestBase {
  type: "plugin";
  runner: PluginRunnerType;
}
export const pluginManifestSchema = z.object({
  type: z.literal("plugin"),
  runner: pluginRunnerTypeSchema,
  ...artifactManifestBaseSchema.shape,
});
