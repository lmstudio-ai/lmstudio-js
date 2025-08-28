import { z } from "zod";
import {
  modelCompatibilityTypeSchema,
  type ModelCompatibilityType,
} from "./ModelCompatibilityType.js";
import { quantizationSchema, type Quantization } from "./Quantization.js";

/**
 * Represents info of a model that is downloaded and sits on the disk. This is the base type shared
 * by all models of different domains.
 *
 * @public
 */
export interface ModelInfoBase {
  /**
   * The key of the model. Use to load the model.
   */
  modelKey: string;
  /**
   * The format of the model.
   */
  format: ModelCompatibilityType;
  /**
   * Machine generated name of the model.
   */
  displayName: string;
  /**
   * Publisher of the model.
   */
  publisher: string;
  /**
   * The relative path of the model.
   */
  path: string;
  /**
   * The size of the model in bytes.
   */
  sizeBytes: number;
  /**
   * A string that represents the number of params in the model. May not always be available.
   */
  paramsString?: string;
  /**
   * The architecture of the model. May not always be available.
   */
  architecture?: string;
  /**
   * The quantization of the model. May not always be available.
   */
  quantization?: Quantization;
}
export const modelInfoBaseSchema = z.object({
  modelKey: z.string(),
  format: modelCompatibilityTypeSchema,
  displayName: z.string(),
  publisher: z.string(),
  path: z.string(),
  sizeBytes: z.number().int(),
  paramsString: z.string().optional(),
  architecture: z.string().optional(),
  quantization: quantizationSchema.optional(),
});

/**
 * Represents info of a model that is already loaded. Contains all fields from
 * {@link ModelInfoBase}. This is the base typed share by all model instances of different domains.
 *
 * @public
 */
export interface ModelInstanceInfoBase extends ModelInfoBase {
  /**
   * The identifier of the instance.
   */
  identifier: string;
  /**
   * The internal immutable reference of the instance.
   */
  instanceReference: string;
  /**
   * The TTL in milliseconds for the instance. If not set, the instance does not expire.
   */
  ttlMs: number | null;
  /**
   * Last used time as a unix timestamp in milliseconds.
   */
  lastUsedTime: number | null;
}
export const modelInstanceInfoBaseSchema = modelInfoBaseSchema.extend({
  identifier: z.string(),
  instanceReference: z.string(),
  ttlMs: z.number().nullable(),
  lastUsedTime: z.number().nullable(),
});
