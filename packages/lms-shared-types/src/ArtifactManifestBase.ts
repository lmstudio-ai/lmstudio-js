import { z, type ZodSchema } from "zod";
import { fileNameSchema } from "./path.js";

export const kebabCaseRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const kebabCaseSchema = z.string().regex(kebabCaseRegex);

export interface ArtifactModelDependencyDirectURLDownloadSourceFile {
  /**
   * The URL to download the model from.
   */
  url: string;
  /**
   * The SHA256 hash of the model file encoded in hex.
   */
  sha256Hex: string;
  /**
   * The size of the model file in bytes.
   */
  sizeBytes: number;
  /**
   * The relative path to the model directory. Does not include the leading slash or dot. Currently
   * only supports file names.
   */
  relativePath: string;
}
export const artifactModelDependencyDirectURLDownloadSourceFileSchema = z.object({
  url: z.string().url(),
  sha256Hex: z.string().length(64),
  sizeBytes: z.number().int().positive(),
  // Currently only support file names and is unlikely to change for the time being.
  relativePath: fileNameSchema,
});

export interface ArtifactModelDependencyDirectURLDownloadSource {
  type: "url";
}
export const artifactModelDependencyDirectURLDownloadSourceSchema = z.object({
  type: z.literal("url"),
});

export type ArtifactModelDependencyDownloadSource = ArtifactModelDependencyDirectURLDownloadSource;
export const artifactModelDependencyDownloadSourceSchema = z.discriminatedUnion("type", [
  artifactModelDependencyDirectURLDownloadSourceSchema,
]) as ZodSchema<ArtifactModelDependencyDownloadSource>;

export interface ArtifactModelDependency {
  type: "model";
  /**
   * The model key. This is used to identify if whether the dependency has been downloaded or not.
   */
  modelKey: string;
  /**
   * The publisher. This is the name of the first-level folder. For example: lmstudio-community
   */
  publisher: string;
  /**
   * The name of the model. This is the name of the second-level folder. For example:
   * DeepSeek-R1-Distill-Llama-8B-GGUF
   */
  name: string;
  /**
   * Describes how to download the model. Currently only supports downloading from a URL.
   */
  content: Array<ArtifactModelDependencyDownloadSource>;
}
export const artifactModelDependencySchema = z.object({
  type: z.literal("model"),
  modelKey: z.string().min(1),
  publisher: fileNameSchema,
  name: fileNameSchema,
  content: z.array(artifactModelDependencyDownloadSourceSchema),
});

export type ArtifactDependency = ArtifactModelDependency;
export const artifactDependencySchema = z.discriminatedUnion("type", [
  artifactModelDependencySchema,
]) as ZodSchema<ArtifactDependency>;

/**
 * Base type for the manifest of an artifact.
 *
 * @public
 */
export interface ArtifactManifestBase {
  owner: string;
  name: string;
  description: string;
  revision?: number;
  dependencies?: Array<ArtifactDependency>;
}
export const artifactManifestBaseSchema = z.object({
  owner: kebabCaseSchema,
  name: kebabCaseSchema.min(1, "Name is required").max(100, "Name too long"),
  description: z.string().max(1000, "Description too long"),
  revision: z.number().int().optional(),
  dependencies: z.array(artifactDependencySchema).optional(),
});
