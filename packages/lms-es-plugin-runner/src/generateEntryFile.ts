import { mkdir, writeFile } from "fs/promises";
import { dirname, join } from "path";

const template = `\
import { LMStudioClient, type PluginContext } from "@lmstudio/sdk";

declare var process: any;

// We receive runtime information in the environment variables.
const clientIdentifier = process.env.LMS_PLUGIN_CLIENT_IDENTIFIER;
const clientPasskey = process.env.LMS_PLUGIN_CLIENT_PASSKEY;
const baseUrl = process.env.LMS_PLUGIN_BASE_URL;

const client = new LMStudioClient({
  clientIdentifier,
  clientPasskey,
  baseUrl,
});

(globalThis as any).__LMS_PLUGIN_CONTEXT = true;

let predictionLoopHandlerSet = false;
let promptPreprocessorSet = false;
let configSchematicsSet = false;
let globalConfigSchematicsSet = false;
let toolsProviderSet = false;
let generatorSet = false;

const selfRegistrationHost = client.plugins.getSelfRegistrationHost();

const pluginContext: PluginContext = {
  withPredictionLoopHandler: (generate) => {
    if (predictionLoopHandlerSet) {
      throw new Error("PredictionLoopHandler already registered");
    }
    if (toolsProviderSet) {
      throw new Error("PredictionLoopHandler cannot be used with a tools provider");
    }

    predictionLoopHandlerSet = true;
    selfRegistrationHost.setPredictionLoopHandler(generate);
    return pluginContext;
  },
  withPromptPreprocessor: (preprocess) => {
    if (promptPreprocessorSet) {
      throw new Error("PromptPreprocessor already registered");
    }
    promptPreprocessorSet = true;
    selfRegistrationHost.setPromptPreprocessor(preprocess);
    return pluginContext;
  },
  withConfigSchematics: (configSchematics) => {
    if (configSchematicsSet) {
      throw new Error("Config schematics already registered");
    }
    configSchematicsSet = true;
    selfRegistrationHost.setConfigSchematics(configSchematics);
    return pluginContext;
  },
  withGlobalConfigSchematics: (globalConfigSchematics) => {
    if (globalConfigSchematicsSet) {
      throw new Error("Global config schematics already registered");
    }
    globalConfigSchematicsSet = true;
    selfRegistrationHost.setGlobalConfigSchematics(globalConfigSchematics);
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
    selfRegistrationHost.setToolsProvider(toolsProvider);
    return pluginContext;
  },
  withGenerator: (generator) => {
    if (generatorSet) {
      throw new Error("Generator already registered");
    }

    generatorSet = true;
    selfRegistrationHost.setGenerator(generator);
    return pluginContext;
  },
};

import("./../src/index.ts").then(async module => {
  return await module.main(pluginContext);
}).then(() => {
  selfRegistrationHost.initCompleted();
}).catch((error) => {
  console.error("Failed to execute the main function of the plugin.");
  console.error(error);
});
`;

/**
 * esbuild bundles the entry file to CommonJS, and the bundle is written into the
 * plugin's `.lmstudio` folder as a `.js` file. Node decides whether a `.js` file
 * is CommonJS or ESM from the nearest `package.json`, which - with nothing in
 * `.lmstudio` - is the plugin's own. A plugin declaring `"type": "module"`
 * therefore has its bundle loaded as ESM, and it dies on the first `require`
 * the bundle emits:
 *
 *     ReferenceError: require is not defined in ES module scope
 *
 * Writing a `package.json` into `.lmstudio` itself makes that folder the nearest
 * one, so the bundle is read as CommonJS whatever the plugin declares. This is
 * written next to the entry file rather than at either build site because both
 * the dev watcher and the production installer go through here - fixing it in
 * one of them and not the other is how this would come back.
 */
const commonJsMarkerContents = JSON.stringify({ type: "commonjs" }, null, 2) + "\n";

interface GenerateEntryFileOpts {}
export function generateEntryFileContents(_opts: GenerateEntryFileOpts) {
  return template;
}
export function generateCommonJsMarkerContents() {
  return commonJsMarkerContents;
}
export async function generateEntryFileAt(path: string, _opts: GenerateEntryFileOpts) {
  const directoryPath = dirname(path);
  await mkdir(directoryPath, { recursive: true });
  await writeFile(path, template, "utf-8");
  await writeFile(join(directoryPath, "package.json"), commonJsMarkerContents, "utf-8");
}
