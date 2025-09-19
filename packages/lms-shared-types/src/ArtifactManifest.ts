import { z, type ZodSchema } from "zod";
import { modelManifestSchema, type ModelManifest } from "./ModelManifest.js";
import { pluginManifestUnrefinedSchema, type PluginManifest } from "./PluginManifest.js";
import { presetManifestSchema, type PresetManifest } from "./PresetManifest.js";

/**
 * The type for the manifest.json file.
 */
export type ArtifactManifest = PluginManifest | PresetManifest | ModelManifest;
export const artifactManifestSchema = z
  .discriminatedUnion("type", [
    pluginManifestUnrefinedSchema,
    presetManifestSchema,
    modelManifestSchema,
  ])
  .superRefine((artifactManifest, ctx) => {
    if (
      artifactManifest.type === "plugin" &&
      artifactManifest.runner !== "deno" &&
      artifactManifest.sandbox !== undefined &&
      artifactManifest.sandbox.enabled
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sandbox"],
        message:
          "Sandboxing is only supported for deno runners. Either disable sandboxing, or switch to deno.",
      });
    }
  }) as ZodSchema<ArtifactManifest>;

/**
 * Represents the type of an artifact.
 *
 * @public
 */
export type ArtifactType = "plugin" | "preset" | "model";
export const artifactTypeSchema = z.enum(["plugin", "preset", "model"]);
