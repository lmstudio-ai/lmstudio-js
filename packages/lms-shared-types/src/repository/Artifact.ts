import { z } from "zod";

export interface StaffPickedArtifact {
  owner: string;
  name: string;
  description: string;
  staffPickedAt: number;
  downloads: number;
  likeCount: number;
  sizeBytes: number;
}

export const staffPickedArtifactSchema = z.object({
  owner: z.string(),
  name: z.string(),
  description: z.string(),
  staffPickedAt: z.number(),
  downloads: z.number(),
  likeCount: z.number(),
  sizeBytes: z.number(),
}) as z.ZodType<StaffPickedArtifact>;
