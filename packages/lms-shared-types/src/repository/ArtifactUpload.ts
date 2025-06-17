import { z, type ZodSchema } from "zod";

/**
 * Represents a file entry in a local artifact.
 *
 * @public
 */
export interface LocalArtifactFileEntry {
  relativePath: string;
  sizeBytes: number;
}
export const localArtifactFileEntrySchema = z.object({
  relativePath: z.string(),
  sizeBytes: z.number().int(),
}) as ZodSchema<LocalArtifactFileEntry>;

/**
 * Represents a the list of files in a local artifact.
 *
 * @public
 */
export interface LocalArtifactFileList {
  files: Array<LocalArtifactFileEntry>;
  usedIgnoreFile: string | null;
}
export const localArtifactFileListSchema = z.object({
  files: z.array(localArtifactFileEntrySchema),
  usedIgnoreFile: z.string().nullable(),
}) as ZodSchema<LocalArtifactFileList>;
