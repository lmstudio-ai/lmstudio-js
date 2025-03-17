import { z } from "zod";
import { type ModelDomainType, modelDomainTypeSchema } from "./ModelDomainType.js";
import { type ModelQuery, modelQuerySchema } from "./ModelSpecifier.js";

export type GenericErrorDisplayData =
  | {
      code: "generic.specificModelUnloaded";
    }
  | {
      code: "generic.noModelMatchingQuery";
      query: ModelQuery;
      loadedModelsSample: Array<string>;
      totalLoadedModels: number;
    }
  | {
      code: "generic.pathNotFound";
      path: string;
      availablePathsSample: Array<string>;
      totalModels: number;
    }
  | {
      code: "generic.identifierNotFound";
      identifier: string;
      loadedModelsSample: Array<string>;
      totalLoadedModels: number;
    }
  | {
      code: "generic.domainMismatch";
      path: string;
      actualDomain: ModelDomainType;
      expectedDomain: ModelDomainType;
    }
  | {
      code: "generic.engineDoesNotSupportFeature";
      feature: string;
      engineName: string;
      engineType: string;
      installedVersion: string;
      supportedVersion: string | null;
    }
  | {
      code: "generic.presetNotFound";
      specifiedFuzzyPresetIdentifier: string;
      availablePresetsSample: Array<{
        identifier: string;
        name: string;
      }>;
      totalAvailablePresets: number;
    };
export const genericErrorDisplayDataSchema = [
  z.object({
    code: z.literal("generic.specificModelUnloaded"),
  }),
  z.object({
    code: z.literal("generic.noModelMatchingQuery"),
    query: modelQuerySchema,
    loadedModelsSample: z.array(z.string()),
    totalLoadedModels: z.number().int(),
  }),
  z.object({
    code: z.literal("generic.pathNotFound"),
    path: z.string(),
    availablePathsSample: z.array(z.string()),
    totalModels: z.number().int(),
  }),
  z.object({
    code: z.literal("generic.identifierNotFound"),
    identifier: z.string(),
    loadedModelsSample: z.array(z.string()),
    totalLoadedModels: z.number().int(),
  }),
  z.object({
    code: z.literal("generic.domainMismatch"),
    path: z.string(),
    actualDomain: modelDomainTypeSchema,
    expectedDomain: modelDomainTypeSchema,
  }),
  z.object({
    code: z.literal("generic.engineDoesNotSupportFeature"),
    feature: z.string(),
    engineName: z.string(),
    engineType: z.string(),
    installedVersion: z.string(),
    supportedVersion: z.string().nullable(),
  }),
  z.object({
    code: z.literal("generic.presetNotFound"),
    specifiedFuzzyPresetIdentifier: z.string(),
    availablePresetsSample: z.array(
      z.object({
        identifier: z.string(),
        name: z.string(),
      }),
    ),
    totalAvailablePresets: z.number().int(),
  }),
] as const;
