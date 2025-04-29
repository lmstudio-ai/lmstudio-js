import { z } from "zod";
import { type SerializedLMSExtendedError } from "./Error.js";
import { jsonSerializableSchema } from "./JSONSerializable.js";

/**
 * @public
 */
export interface SerializedKVConfigSchematicsField {
  shortKey: string;
  fullKey: string;
  typeKey: string;
  typeParams: any;
  defaultValue: any;
}
export const serializedKVConfigSchematicsFieldSchema = z.object({
  shortKey: z.string(),
  fullKey: z.string(),
  typeKey: z.string(),
  typeParams: jsonSerializableSchema,
  defaultValue: jsonSerializableSchema,
}) as z.ZodSchema<SerializedKVConfigSchematicsField>;

/**
 * @public
 */
export interface SerializedKVConfigSchematics {
  fields: Array<SerializedKVConfigSchematicsField>;
  extensionPrefixes?: Array<string>;
}
export const serializedKVConfigSchematicsSchema = z.object({
  fields: z.array(serializedKVConfigSchematicsFieldSchema),
  extensionPrefixes: z.array(z.string()).optional(),
}) as z.ZodSchema<SerializedKVConfigSchematics>;

export interface KVConfigSchematicsDeserializationError {
  fullKey: string;
  error: SerializedLMSExtendedError;
}
export const kvConfigSchematicsDeserializationErrorSchema = z.object({
  fullKey: z.string(),
  error: jsonSerializableSchema,
}) as z.ZodSchema<KVConfigSchematicsDeserializationError>;
