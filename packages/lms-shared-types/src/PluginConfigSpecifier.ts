import { z } from "zod";
import { kvConfigSchema, type KVConfig } from "./KVConfig.js";

/**
 * When using a plugin remotely, the config of the plugin is oftentimes required. There are two ways
 * of specifying the config:
 *
 * - Either provided directly as a KV Config
 * - Or provide the credentials for a specific prediction process, and LM Studio will automatically
 *   look up the config associated with the plugin in that prediction process.
 */
export type PluginConfigSpecifier =
  | {
      type: "direct";
      config: KVConfig;
      workingDirectoryPath?: string;
    }
  | {
      type: "predictionProcess";
      /** Processing Context Identifier */
      pci: string;
      token: string;
    };
export const pluginConfigSpecifierSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("direct"),
    config: kvConfigSchema,
    workingDirectoryPath: z.string().optional(),
  }),
  z.object({
    type: z.literal("predictionProcess"),
    pci: z.string(),
    token: z.string(),
  }),
]);
