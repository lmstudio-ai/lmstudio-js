import { z, type ZodSchema } from "zod";
import { artifactManifestBaseSchema, type ArtifactManifestBase } from "./ArtifactManifestBase.js";

/**
 * @public
 *
 * "ecmascript" is the same as "node" and is deprecated.
 */
export type PluginRunnerType = "ecmascript" | "node" | "deno" | "mcpBridge";
export const pluginRunnerTypeSchema = z.enum([
  "ecmascript",
  "node",
  "deno",
  "mcpBridge",
]) as ZodSchema<PluginRunnerType>;

/**
 * @public
 *
 * Configures the type of file system access.
 */
export type PluginSandboxFileSystemSettingsType = "fullAccess" | "restricted" | "none";
export const pluginSandboxFileSystemSettingsTypeSchema = z.enum([
  "fullAccess",
  "restricted",
  "none",
]) as ZodSchema<PluginSandboxFileSystemSettingsType>;

/**
 * @public
 *
 * Configures the file system access.
 */
export interface PluginSandboxFileSystemSettings {
  type: PluginSandboxFileSystemSettingsType;
  reason: string;
}
export const pluginSandboxFileSystemSettingsSchema = z.object({
  type: pluginSandboxFileSystemSettingsTypeSchema,
  reason: z.string(),
}) as ZodSchema<PluginSandboxFileSystemSettings>;

/**
 * @public
 */
export interface PluginSandboxNetworkSettings {
  hosts: "*" | Array<string>;
  reason: string;
}
export const pluginSandboxNetworkSettingsSchema = z.object({
  hosts: z.union([z.literal("*"), z.array(z.string())]),
  reason: z.string(),
}) as ZodSchema<PluginSandboxNetworkSettings>;

/**
 * @public
 */
export type PluginSandboxSettings =
  | {
      enabled: false;
      reason: string;
    }
  | {
      enabled: true;
      fileSystem?: PluginSandboxFileSystemSettings;
      network?: PluginSandboxNetworkSettings;
    };
export const pluginSandboxSettingsSchema = z.discriminatedUnion("enabled", [
  z.object({
    enabled: z.literal(false),
    reason: z.string(),
  }),
  z.object({
    enabled: z.literal(true),
    fileSystem: pluginSandboxFileSystemSettingsSchema.optional(),
    network: pluginSandboxNetworkSettingsSchema.optional(),
  }),
]) as ZodSchema<PluginSandboxSettings>;

/**
 * @public
 */
export interface PluginManifest extends ArtifactManifestBase {
  type: "plugin";
  runner: PluginRunnerType;
  sandbox?: PluginSandboxSettings;
}
export const pluginManifestUnrefinedSchema = z.object({
  type: z.literal("plugin"),
  runner: pluginRunnerTypeSchema,
  sandbox: pluginSandboxSettingsSchema.optional(),
  ...artifactManifestBaseSchema.shape,
});
export const pluginManifestSchema: ZodSchema<PluginManifest> =
  pluginManifestUnrefinedSchema.superRefine((pluginManifest, ctx) => {
    if (
      pluginManifest.runner !== "deno" &&
      pluginManifest.sandbox !== undefined &&
      pluginManifest.sandbox.enabled
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sandbox"],
        message:
          "Sandboxing is only supported for deno runners. Either disable sandboxing, or switch to deno.",
      });
    }
  });
