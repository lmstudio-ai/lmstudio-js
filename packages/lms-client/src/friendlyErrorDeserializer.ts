import { makePrettyError, makeTitledPrettyError, text } from "@lmstudio/lms-common";
import {
  attachSerializedErrorData,
  type ErrorDisplayData,
  type ModelDomainType,
  type ModelQuery,
  type SerializedLMSExtendedError,
} from "@lmstudio/lms-shared-types";
import chalk from "chalk";

type DisplayData<TCode extends ErrorDisplayData["code"]> = Extract<
  ErrorDisplayData,
  { code: TCode }
>;

function deserializeOtherError(serialized: SerializedLMSExtendedError, stack?: string): Error {
  let content = chalk.redBright(` ${serialized.title} `);
  if (serialized.suggestion !== undefined) {
    content +=
      "\n\n\n " +
      chalk.bgWhite.black("  (!) SUGGESTION  ") +
      "\n\n" +
      chalk.white(serialized.suggestion);
  }
  if (serialized.cause !== undefined) {
    content +=
      "\n\n\n " + chalk.bgWhite.black("  (X) CAUSE  ") + "\n\n" + chalk.gray(serialized.cause);
  }
  return makePrettyError(content, stack);
}

const errorDeserializersMap = new Map<string, (data: ErrorDisplayData, stack?: string) => Error>();
function registerErrorDeserializer<TCode extends ErrorDisplayData["code"]>(
  code: TCode,
  deserializer: (data: DisplayData<TCode>, stack?: string) => Error,
) {
  errorDeserializersMap.set(code, deserializer as any);
}

function formatAvailableLLMs(availablePathsSample: Array<string>, totalModels: number) {
  if (availablePathsSample.length === 0) {
    return chalk.gray("    You don't have any LLMs downloaded.");
  }
  let text = availablePathsSample.map(path => chalk.cyanBright(" • " + path)).join("\n");
  if (availablePathsSample.length < totalModels) {
    text += chalk.gray(`\n     ... (and ${totalModels - availablePathsSample.length} more)`);
  }
  return text;
}

registerErrorDeserializer(
  "generic.pathNotFound",
  ({ availablePathsSample, path, totalModels }, stack) => {
    return makeTitledPrettyError(
      `Cannot find a model with path "${chalk.yellowBright(path)}"`,
      text`
        Here are your available models:

        ${formatAvailableLLMs(availablePathsSample, totalModels)}

        Run

            ${chalk.yellowBright("lms ls")}

        to see a full list of loadable models
      `,
      stack,
    );
  },
);

function formatLoadedModels(loadedModelsSample: Array<string>, totalLoadedModels: number) {
  if (loadedModelsSample.length === 0) {
    return chalk.gray("    You don't have any models loaded.");
  }
  let text = loadedModelsSample.map(path => chalk.cyanBright(" • " + path)).join("\n");
  if (loadedModelsSample.length < totalLoadedModels) {
    text += chalk.gray(`\n     ... (and ${totalLoadedModels - loadedModelsSample.length} more)`);
  }
  return text;
}

registerErrorDeserializer(
  "generic.identifierNotFound",
  ({ loadedModelsSample, identifier, totalLoadedModels }, stack) => {
    return makeTitledPrettyError(
      `Cannot find a model with identifier "${chalk.yellowBright(identifier)}"`,
      text`
        Here are your loaded models:

        ${formatLoadedModels(loadedModelsSample, totalLoadedModels)}

        Run

            ${chalk.yellowBright("lms ps")}

        to see a full list of loaded models
      `,
      stack,
    );
  },
);

registerErrorDeserializer("generic.specificModelUnloaded", (_, stack) => {
  return makePrettyError(
    chalk.bgRed.white(text`
      This model has already been unloaded.
    `),
    stack,
  );
});

function getModelDomainTypeDisplayNameSingular(domain: ModelDomainType) {
  switch (domain) {
    case "llm":
      return "an LLM";
    case "embedding":
      return "an embedding model";
    case "imageGen":
      return "an image generation model";
    case "transcription":
      return "a transcription model";
    case "tts":
      return "a text-to-speech model";
    default: {
      const exhaustiveCheck: never = domain;
      console.error(`Unexpected domain type: ${exhaustiveCheck}`);
      return "Unknown Model Domain";
    }
  }
}

function formatQuery(query: ModelQuery) {
  const requirements: Array<string> = [];
  if (query.domain !== undefined) {
    requirements.push(text`
      The model must be ${chalk.yellowBright(getModelDomainTypeDisplayNameSingular(query.domain))}
    `);
  }
  if (query.identifier !== undefined) {
    requirements.push(`The identifier must be exactly "${chalk.yellowBright(query.identifier)}"`);
  }
  if (query.path !== undefined) {
    requirements.push(`The path must match "${chalk.yellowBright(query.path)}"`);
  }
  if (requirements.length === 0) {
    return chalk.gray(" • Any Model");
  }
  return requirements.map(req => chalk.white(" • " + req)).join("\n");
}

registerErrorDeserializer(
  "generic.noModelMatchingQuery",
  ({ loadedModelsSample, totalLoadedModels, query }, stack) => {
    return makePrettyError(
      text`
        ${chalk.bgRed.white(" No loaded model satisfies all requirements specified in the query. ")}

        Loaded Models:

        ${formatLoadedModels(loadedModelsSample, totalLoadedModels)}

        Your query:

        ${formatQuery(query)}

        Run

            ${chalk.yellowBright("lms ps")}

        to see a full list of loaded models with details
      `,
      stack,
    );
  },
);

registerErrorDeserializer(
  "generic.domainMismatch",
  ({ actualDomain, expectedDomain, path }, stack) => {
    return makePrettyError(
      text`
        ${chalk.bgRed.white(" Model has wrong domain. ")}

        Expecting ${chalk.greenBright(path)} to be ${chalk.yellowBright(
          getModelDomainTypeDisplayNameSingular(expectedDomain),
        )}, but it is actually ${chalk.yellowBright(
          getModelDomainTypeDisplayNameSingular(actualDomain),
        )}.
      `,
      stack,
    );
  },
);

function formatAvailablePresets(
  presets: Array<{ identifier: string; name: string }>,
  totalAvailablePresets: number,
) {
  if (presets.length === 0) {
    return chalk.gray("    You don't have any presets available.");
  }
  let text = presets
    .map(({ identifier, name }) => chalk.cyanBright(` • ${name} (${chalk.cyan(identifier)})`))
    .join("\n");
  if (presets.length < totalAvailablePresets) {
    text += chalk.gray(`\n     ... (and ${totalAvailablePresets - presets.length} more)`);
  }
  return text;
}

registerErrorDeserializer(
  "generic.presetNotFound",
  ({ specifiedFuzzyPresetIdentifier, availablePresetsSample, totalAvailablePresets }) => {
    return makeTitledPrettyError(
      `Cannot find a preset with identifier "${chalk.yellowBright(specifiedFuzzyPresetIdentifier)}"`,
      text`
        Here are your available presets:

        ${formatAvailablePresets(availablePresetsSample, totalAvailablePresets)}

        Note: To specify a preset in the SDK, you need to use its identifier (in parentheses). You
        can get a preset's identifier by right-clicking on it and then select "Copy Preset
        Identifier".
      `,
    );
  },
);

export function friendlyErrorDeserializer(
  serialized: SerializedLMSExtendedError,
  _directCause: string,
  stack?: string,
): Error {
  if (serialized.displayData === undefined) {
    return deserializeOtherError(serialized, stack);
  }
  let error: Error;
  const specificDeserializer = errorDeserializersMap.get(serialized.displayData.code);
  if (specificDeserializer !== undefined) {
    error = specificDeserializer(serialized.displayData, stack);
    attachSerializedErrorData(error, serialized);
    return error;
  } else {
    return deserializeOtherError(serialized, stack);
  }
}
