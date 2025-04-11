import { z, type ZodSchema } from "zod";
import { fileNameSchema } from "./path";

export const kebabCaseRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const kebabCaseSchema = z.string().regex(kebabCaseRegex);

export interface ArtifactModelDependencyHuggingFaceDownloadSource {
  type: "huggingface";
  user: string;
  repo: string;
}
export const artifactModelDependencyHuggingFaceDownloadSourceSchema = z.object({
  type: z.literal("huggingface"),
  user: fileNameSchema,
  repo: fileNameSchema,
});

export type ArtifactModelDependencyDownloadSource =
  ArtifactModelDependencyHuggingFaceDownloadSource;
export const artifactModelDependencyDownloadSourceSchema = z.discriminatedUnion("type", [
  artifactModelDependencyHuggingFaceDownloadSourceSchema,
]) as ZodSchema<ArtifactModelDependencyDownloadSource>;

export type ArtifactDependencyPurpose = "baseModel" | "draftModel" | "custom";
export const artifactDependencyPurposeSchema = z.enum([
  "baseModel",
  "draftModel",
  "custom",
]) as ZodSchema<ArtifactDependencyPurpose>;

export interface ArtifactDependencyBase {
  purpose: ArtifactDependencyPurpose;
}
export const artifactDependencyBaseSchema = z.object({
  purpose: artifactDependencyPurposeSchema,
});

export interface ArtifactModelDependency extends ArtifactDependencyBase {
  type: "model";
  /**
   * The model key. This is used to identify if whether the dependency has been downloaded or not.
   * Any model matching any of the model keys listed here will be considered a match, and can
   * satisfy the entire model dependency.
   */
  modelKeys: Array<string>;
  /**
   * Describes how to download the model. Currently only supports downloading from a URL.
   */
  sources: Array<ArtifactModelDependencyDownloadSource>;
}
export const artifactModelDependencySchema = z.object({
  type: z.literal("model"),
  ...artifactDependencyBaseSchema.shape,
  modelKeys: z.array(z.string().min(1)),
  sources: z.array(artifactModelDependencyDownloadSourceSchema),
});

/**
 * Depends on other artifacts.
 */
export interface ArtifactArtifactDependency extends ArtifactDependencyBase {
  type: "artifact";
  owner: string;
  name: string;
}
export const artifactArtifactDependencySchema = z.object({
  type: z.literal("artifact"),
  ...artifactDependencyBaseSchema.shape,
  owner: kebabCaseSchema,
  name: kebabCaseSchema,
});

export type ArtifactDependency = ArtifactModelDependency | ArtifactArtifactDependency;
export const artifactDependencySchema = z.discriminatedUnion("type", [
  artifactModelDependencySchema,
  artifactArtifactDependencySchema,
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
