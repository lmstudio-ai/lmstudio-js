import { z } from "zod";

export interface RuntimeEngineSpecifier {
  name: string;
  version: string;
}

export const runtimeEngineSpecifierSchema = z.object({
  name: z.string(),
  version: z.string(),
});

export interface RuntimeEngineInfo extends RuntimeEngineSpecifier {
  engine: string;
  platform: string;
  cpu: {
    architecture: string;
    instructionSetExtensions?: string[];
  };
  gpu?: {
    make?: string;
    framework?: string;
  };
  supportedModelFormats: string[];
}

export const runtimeEngineInfoSchema = runtimeEngineSpecifierSchema.extend({
  engine: z.string(),
  platform: z.string(),
  cpu: z.object({
    architecture: z.string(),
    instructionSetExtensions: z.array(z.string()).optional(),
  }),
  gpu: z
    .object({
      make: z.string().optional(),
      framework: z.string().optional(),
    })
    .optional(),
  supportedModelFormats: z.array(z.string()),
});

export interface RuntimeEngineSelectionInfo extends RuntimeEngineSpecifier {
  modelFormats: string[];
}

export const runtimeEngineSelectionInfoSchema = runtimeEngineSpecifierSchema.extend({
  modelFormats: z.array(z.string()),
});
