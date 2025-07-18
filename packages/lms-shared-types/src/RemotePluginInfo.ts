import { z, type ZodSchema } from "zod";

/**
 * Represents a plugin that is currently available in LM Studio.
 *
 * @experimental [EXP-USE-PLUGINS-API] Using plugins API is still in development. This may change in
 * the future without warning.
 *
 * @public
 */
export interface RemotePluginInfo {
  /**
   * The identifier of the plugin. For non-dev plugins, this is the same as the artifact identifier
   * when uploaded to LM Studio Hub. For example, `lmstudio/dice`.
   *
   * For dev plugins, this will be prefixed with `dev/` to indicate that it is a development
   * version. For example, `dev/owner/plugin-name`.
   *
   * The exact format of this identifier may change in the future. You should not parse it.
   */
  identifier: string;
  /**
   * Whether this plugin is in development mode, e.g. running externally using `lms dev`.
   */
  isDev: boolean;
  /**
   * Whether this plugin is trusted.
   */
  isTrusted: boolean;
  /**
   * Whether this plugin has a prompt preprocessor component.
   */
  hasPromptPreprocessor: boolean;
  /**
   * Whether this plugin has a prediction loop handler component.
   */
  hasPredictionLoopHandler: boolean;
  /**
   * Whether this plugin has a tools provider component.
   */
  hasToolsProvider: boolean;
  /**
   * Whether this plugin has a generator component.
   */
  hasGenerator: boolean;
}
export const remotePluginInfoSchema = z.object({
  identifier: z.string(),
  isDev: z.boolean(),
  isTrusted: z.boolean(),
  hasPromptPreprocessor: z.boolean(),
  hasPredictionLoopHandler: z.boolean(),
  hasToolsProvider: z.boolean(),
  hasGenerator: z.boolean(),
}) as ZodSchema<RemotePluginInfo>;
