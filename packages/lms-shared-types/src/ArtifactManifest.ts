import { z, type ZodSchema } from "zod";
import { modelManifestSchema, type ModelManifest } from "./ModelManifest.js";
import { pluginManifestSchema, type PluginManifest } from "./PluginManifest.js";
import { presetManifestSchema, type PresetManifest } from "./PresetManifest.js";

/**
 * The type for the manifest.json file.
 */
export type ArtifactManifest = PluginManifest | PresetManifest | ModelManifest;
export const artifactManifestSchema = z.discriminatedUnion("type", [
  pluginManifestSchema,
  presetManifestSchema,
  modelManifestSchema,
]) as ZodSchema<ArtifactManifest>;

/**
 * Represents the type of an artifact.
 *
 * @public
 */
export type ArtifactType = "plugin" | "preset" | "model";
export const artifactTypeSchema = z.enum(["plugin", "preset", "model"]);
