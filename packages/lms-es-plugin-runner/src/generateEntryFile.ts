const template = `\
import { LMStudioClient, type PluginContext } from "@lmstudio/sdk";

declare var process: any;

// We receive runtime information in the environment variables.
const clientIdentifier = process.env.LMS_PLUGIN_CLIENT_IDENTIFIER;
const clientPasskey = process.env.LMS_PLUGIN_CLIENT_PASSKEY;

const client = new LMStudioClient({
  clientIdentifier,
  clientPasskey,
});

(globalThis as any).__LMS_PLUGIN_CONTEXT = true;

let predictionLoopHandlerSet = false;
let preprocessorSet = false;
let configSchematicsSet = false;
let toolsProviderSet = false;
let generatorSet = false;

const pluginContext: PluginContext = {
  withPredictionLoopHandler: (generate) => {
    if (predictionLoopHandlerSet) {
      throw new Error("PredictionLoopHandler already registered");
    }
    if (toolsProviderSet) {
      throw new Error("PredictionLoopHandler cannot be used with a tools provider");
    }

    predictionLoopHandlerSet = true;
    client.plugins.setPredictionLoopHandler(generate);
    return pluginContext;
  },
  withPreprocessor: (preprocess) => {
    if (preprocessorSet) {
      throw new Error("Preprocessor already registered");
    }
    preprocessorSet = true;
    client.plugins.setPreprocessor(preprocess);
    return pluginContext;
  },
  withConfigSchematics: (configSchematics) => {
    if (configSchematicsSet) {
      throw new Error("Config schematics already registered");
    }
    configSchematicsSet = true;
    client.plugins.setConfigSchematics(configSchematics);
    return pluginContext;
  },
  withToolsProvider: (toolsProvider) => {
    if (toolsProviderSet) {
      throw new Error("Tools provider already registered");
    }
    if (predictionLoopHandlerSet) {
      throw new Error("Tools provider cannot be used with a predictionLoopHandler");
    }

    toolsProviderSet = true;
    client.plugins.setToolsProvider(toolsProvider);
    return pluginContext;
  },
  withGenerator: (generator) => {
    if (generatorSet) {
      throw new Error("Generator already registered");
    }

    generatorSet = true;
    client.plugins.setGenerator(generator);
    return pluginContext;
  },
};

import("./../src/index.ts").then(async module => {
  return await module.main(pluginContext);
}).then(() => {
  client.plugins.initCompleted();
}).catch((error) => {
  console.error("Failed to execute the main function of the plugin.");
  console.error(error);
});
`;

interface GenerateEntryFileOpts {}
export function generateEntryFile(_opts: GenerateEntryFileOpts) {
  return template;
}
