import { z, type ZodSchema } from "zod";

/**
 * TODO: Documentation
 *
 * @public
 */
export interface KVConfigField {
  key: string;
  value?: any;
}
export const kvConfigFieldSchema = z.object({
  key: z.string(),
  value: z.any(),
});

/**
 * TODO: Documentation
 *
 * @public
 */
export interface KVConfig {
  fields: Array<KVConfigField>;
}
export const kvConfigSchema = z.object({
  fields: z.array(kvConfigFieldSchema),
});

export type KVConfigLayerName =
  // Config that is currently being edited
  | "currentlyEditing"
  // Config that is currently loaded by the model
  | "currentlyLoaded"
  // Override provided by the caller of the API
  | "apiOverride"
  // Chat specific config in chats
  | "conversationSpecific"
  // Cross-chat global config in chats
  | "conversationGlobal"
  // Per-request preset selection
  | "preset"
  // Server session specific config
  | "serverSession"
  // Override provided in the OpenAI http server
  | "httpServerRequestOverride"
  // Override to allow complete mode formatting
  | "completeModeFormatting"
  // Instance specific config (set in the server tab)
  | "instance"
  // User editable per model defaults
  | "userModelDefault"
  // Virtual model baked in configs
  | "virtualModel"
  // LM Studio provided per model defaults
  | "modelDefault"
  // Hardware config
  | "hardware";

export const kvConfigLayerNameSchema = z.enum([
  "currentlyEditing",
  "currentlyLoaded",
  "apiOverride",
  "conversationSpecific",
  "conversationGlobal",
  "preset",
  "serverSession",
  "httpServerRequestOverride",
  "completeModeFormatting",
  "instance",
  "userModelDefault",
  "virtualModel",
  "modelDefault",
  "hardware",
]);

export interface KVConfigStackLayer {
  layerName: KVConfigLayerName;
  config: KVConfig;
}
export const kvConfigStackLayerSchema = z.object({
  layerName: kvConfigLayerNameSchema,
  config: kvConfigSchema,
});

export interface KVConfigStack {
  layers: Array<KVConfigStackLayer>;
}
export const kvConfigStackSchema = z.object({
  layers: z.array(kvConfigStackLayerSchema),
});

/**
 * @public
 */
export type KVConfigFieldDependency = {
  key: string;
  condition:
    | {
        type: "equals";
        value: any;
      }
    | {
        type: "notEquals";
        value: any;
      };
};
export const kvConfigFieldDependencySchema = z.object({
  key: z.string(),
  condition: z.discriminatedUnion("type", [
    z.object({ type: z.literal("equals"), value: z.any() }),
    z.object({ type: z.literal("notEquals"), value: z.any() }),
  ]),
}) as ZodSchema<KVConfigFieldDependency>;
