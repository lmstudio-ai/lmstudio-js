import { z, type ZodSchema } from "zod";

/**
 * @public
 */
export type PluginRuntimeErrorReport =
  | {
      type: "unauthorized";
      pluginRunId: string;
      serverUrl: string;
      message: string;
    }
  | {
      type: "networkUnavailable";
      pluginRunId: string;
      serverUrl: string;
      message: string;
      unavailableHost?: string;
    };

export const pluginRuntimeErrorReportSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("unauthorized"),
    pluginRunId: z.string(),
    serverUrl: z.string(),
    message: z.string(),
  }),
  z.object({
    type: z.literal("networkUnavailable"),
    pluginRunId: z.string(),
    serverUrl: z.string(),
    message: z.string(),
    unavailableHost: z.string().optional(),
  }),
]) as ZodSchema<PluginRuntimeErrorReport>;
