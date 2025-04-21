import { z, type ZodSchema } from "zod";

export interface LocalArtifactFileEntry {
  relativePath: string;
  sizeBytes: number;
}
export const localArtifactFileEntrySchema = z.object({
  relativePath: z.string(),
  sizeBytes: z.number().int(),
}) as ZodSchema<LocalArtifactFileEntry>;

export interface LocalArtifactFileList {
  files: Array<LocalArtifactFileEntry>;
  usedIgnoreFile: string | null;
}
export const localArtifactFileListSchema = z.object({
  files: z.array(localArtifactFileEntrySchema),
  usedIgnoreFile: z.string().nullable(),
}) as ZodSchema<LocalArtifactFileList>;
