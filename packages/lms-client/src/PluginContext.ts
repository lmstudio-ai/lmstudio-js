import { type ConfigSchematics, type VirtualConfigSchematics } from "./customConfig.js";
import { type Generator } from "./plugins/processing/Generator.js";
import { type PredictionLoopHandler } from "./plugins/processing/PredictionLoopHandler.js";
import { type PromptPreprocessor } from "./plugins/processing/PromptPreprocessor.js";
import { type ToolsProvider } from "./plugins/processing/ToolsProvider.js";

/**
 * @public
 */
export interface PluginContext {
  /**
   * Sets the per-chat config schematics associated with this plugin context. Per-chat configs are
   * stored per chat, useful for configurations that would affect context. Returns the same
   * PluginContext for chaining.
   */
  withConfigSchematics: (
    configSchematics: ConfigSchematics<VirtualConfigSchematics>,
  ) => PluginContext;
  /**
   * Sets the global config schematics associated with this plugin context. Global configs are
   * global across the entire application, useful for things like API keys or database
   * configurations. Returns the same PluginContext for chaining.
   */
  withGlobalConfigSchematics: (
    globalConfigSchematics: ConfigSchematics<VirtualConfigSchematics>,
  ) => PluginContext;
  /**
   * Sets the prediction loop handler associated with this plugin context. Returns the same
   * PluginContext for chaining.
   */
  withPredictionLoopHandler(predictionLoopHandler: PredictionLoopHandler): PluginContext;
  /**
   * Sets the promptPreprocessor associated with this plugin context. Returns the same PluginContext for
   * chaining.
   */
  withPromptPreprocessor(preprocess: PromptPreprocessor): PluginContext;
  /**
   * Sets the tools provider associated with this plugin context. Returns the same PluginContext for
   * chaining.
   */
  withToolsProvider(toolsProvider: ToolsProvider): PluginContext;
  /**
   * Sets the generator associated with this plugin context. Returns the same PluginContext for
   * chaining.
   */
  withGenerator(generator: Generator): PluginContext;
}
