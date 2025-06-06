import { type ConfigSchematics, type VirtualConfigSchematics } from "./customConfig.js";
import { type PredictionLoopHandler } from "./plugins/processing/PredictionLoopHandler.js";
import { type Preprocessor } from "./plugins/processing/Preprocessor.js";
import { type SimpleGenerator } from "./plugins/processing/SimpleGenerator.js";
import { type ToolsProvider } from "./plugins/processing/ToolsProvider.js";

/**
 * @public
 */
export interface PluginContext {
  /**
   * Sets the config schematics associated with this plugin context. Returns the same PluginContext
   * for chaining.
   */
  withConfigSchematics: (
    configSchematics: ConfigSchematics<VirtualConfigSchematics>,
  ) => PluginContext;
  /**
   * Sets the prediction loop handler associated with this plugin context. Returns the same
   * PluginContext for chaining.
   */
  withPredictionLoopHandler(predictionLoopHandler: PredictionLoopHandler): PluginContext;
  /**
   * Sets the preprocessor associated with this plugin context. Returns the same PluginContext for
   * chaining.
   */
  withPreprocessor(preprocess: Preprocessor): PluginContext;
  /**
   * Sets the tools provider associated with this plugin context. Returns the same PluginContext for
   * chaining.
   */
  withToolsProvider(toolsProvider: ToolsProvider): PluginContext;
  /**
   * Returns the config schematics associated with this plugin context.
   */
  withSimplerGenerator(simpleGenerator: SimpleGenerator): PluginContext;
}
