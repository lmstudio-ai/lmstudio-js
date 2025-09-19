/**
 * This file is divided into 4 sections:
 *
 * 1. globalConfigSchematics: The pool for all config keys and their types
 * 2. Functionality scope definitions: i.e. what config keys are available in what functionality
 *    scope. An example functionality scope is llmPrediction.
 * 3. Utility types that can be used to work with types of schema.
 */

import { defaultGPUSplitConfig } from "@lmstudio/lms-shared-types";
import {
  KVConfigSchematicsBuilder,
  type InferConfigFieldFilter,
  type InferConfigSchemaKeys,
  type InferConfigSchemaMap,
  type InferValueTypeKeys,
  type InferValueTypeMap,
  type KVConfigSchematics,
  type KVFieldValueTypeLibrary,
} from "./KVConfig.js";
import { kvValueTypesLibrary } from "./valueTypes.js";

const VIRTUAL_MODEL_CUSTOM_FIELD_EXTENSION_PREFIX = "ext.virtualModel.customField";

// ---------------------------
//  1. globalConfigSchematics
// ---------------------------

export const globalConfigSchematics = new KVConfigSchematicsBuilder(kvValueTypesLibrary)
  .extension(VIRTUAL_MODEL_CUSTOM_FIELD_EXTENSION_PREFIX)
  .field("envVars", "envVars", {}, {})
  .scope("llm.prediction", builder =>
    builder
      .field(
        "temperature",
        "numeric",
        {
          min: 0,
          step: 0.01,
          slider: { min: 0, max: 1, step: 0.01 },
          precision: 2,
          shortHand: "temp",
        },
        0.8,
      )
      .field("contextOverflowPolicy", "contextOverflowPolicy", {}, "truncateMiddle")
      .field(
        "maxPredictedTokens",
        "checkboxNumeric",
        { min: 1, int: true },
        { checked: false, value: 1000 },
      )
      .field("stopStrings", "stringArray", {}, [])
      .field("toolCallStopStrings", "stringArray", {}, [])
      .field("structured", "llamaStructuredOutput", {}, { type: "none" })
      .scope("speculativeDecoding", builder =>
        builder
          .field(
            "draftModel",
            "speculativeDecodingDraftModel",
            {
              modelCentric: true,
            },
            "",
          )
          .field(
            "minDraftLengthToConsider",
            "numeric",
            {
              modelCentric: true,
              min: 0,
              int: true,
              slider: { min: 0, max: 10, step: 1 },
            },
            0,
          )
          .field("numReuseTokens", "numeric", { modelCentric: true, min: 1, int: true }, 256)
          .field(
            "minContinueDraftingProbability",
            "numeric",
            {
              modelCentric: true,
              min: 0,
              max: 1,
              step: 0.01,
              precision: 2,
              slider: { min: 0, max: 1, step: 0.01 },
            },
            0.75,
          )
          .field(
            "maxTokensToDraft",
            "numeric",
            { modelCentric: true, min: 1, int: true, slider: { min: 10, max: 30, step: 1 } },
            16,
          )
          .field(
            "numDraftTokensExact",
            "numeric",
            {
              modelCentric: true,
              min: 1,
              int: true,
              slider: { min: 1, max: 10, step: 1 },
            },
            2,
          ),
      )
      .field("tools", "toolUse", {}, { type: "none" })
      .field("toolChoice", "toolChoice", {}, { type: "generic", mode: "auto" })
      .field("toolNaming", "toolNaming", {}, "removeSpecial")
      .field(
        "promptTemplate",
        "llmPromptTemplate",
        { modelCentric: true },
        {
          type: "manual",
          manualPromptTemplate: {
            beforeSystem: "Instruct: ",
            afterSystem: "\n",
            beforeAssistant: "AI: ",
            afterAssistant: "\n",
            beforeUser: "Human: ",
            afterUser: "\n",
          },
          stopStrings: [],
        },
      )
      .field("systemPrompt", "string", { isParagraph: true }, "")
      .field(
        "seed",
        "checkboxNumeric",
        { int: true, min: -1, uncheckedHint: "config:seedUncheckedHint" },
        { checked: false, value: -1 },
      )
      .field("contextPrefill", "context", {}, [])
      .field("topKSampling", "numeric", { min: -1, max: 500, int: true }, 40)
      .field(
        "repeatPenalty",
        "checkboxNumeric",
        { min: -1, step: 0.01 },
        { checked: true, value: 1.1 },
      )
      .field(
        "minPSampling",
        "checkboxNumeric",
        { min: 0, max: 1, step: 0.01, precision: 2, slider: { min: 0, max: 1, step: 0.01 } },
        { checked: true, value: 0.05 },
      )
      .field(
        "topPSampling",
        "checkboxNumeric",
        { min: 0, max: 1, step: 0.01, precision: 2, slider: { min: 0, max: 1, step: 0.01 } },
        { checked: true, value: 0.95 },
      )
      .field(
        "logProbs",
        "checkboxNumeric",
        { min: 0, max: 100, int: true },
        { checked: false, value: 0 },
      )
      .scope("reasoning", builder =>
        builder.field(
          "parsing",
          "llmReasoningParsing",
          {},
          {
            enabled: true,
            startString: "<think>",
            endString: "</think>",
          },
        ),
      )
      .scope("llama", builder =>
        builder
          .field("cpuThreads", "numeric", { min: 1, int: true }, 4)
          .field(
            "frequencyPenalty",
            "checkboxNumeric",
            { precision: 2 },
            { checked: false, value: 0.0 },
          )
          .field(
            "xtcProbability",
            "checkboxNumeric",
            { min: 0, max: 1, step: 0.01, precision: 2, slider: { min: 0, max: 1, step: 0.01 } },
            { checked: false, value: 0.5 },
          )
          .field(
            "xtcThreshold",
            "checkboxNumeric",
            { min: 0, max: 1, step: 0.01, precision: 2, slider: { min: 0, max: 0.5, step: 0.01 } },
            { checked: false, value: 0.1 },
          )
          .field(
            "presencePenalty",
            "checkboxNumeric",
            { precision: 2 },
            { checked: false, value: 0.0 },
          )
          .field(
            "mirostatSampling",
            "llamaMirostatSampling",
            {},
            {
              // Disabled by default
              version: 0,
              learningRate: 0.1,
              targetEntropy: 5,
            },
          )
          .field(
            "tailFreeSampling",
            "checkboxNumeric",
            { min: 0, max: 1, step: 0.01, precision: 2, slider: { min: 0, max: 1, step: 0.01 } },
            { checked: false, value: 0.95 },
          )
          .field(
            "locallyTypicalSampling",
            "checkboxNumeric",
            { min: 0, max: 1, step: 0.01, precision: 2, slider: { min: 0, max: 1, step: 0.01 } },
            { checked: false, value: 0.9 },
          )
          .field("logitBias", "llamaLogitBias", {}, []),
      ),
  )
  .scope("llm.load", builder =>
    builder
      .field(
        "contextLength",
        "contextLength",
        {
          machineDependent: true,
        },
        2048,
      )
      .field("numExperts", "numeric", { min: 0, int: true }, 0)
      .field(
        "seed",
        "checkboxNumeric",
        { int: true, min: -1, uncheckedHint: "config:seedUncheckedHint" },
        { checked: false, value: -1 },
      )
      .field("offloadKVCacheToGpu", "boolean", {}, true)
      .field(
        "numCpuExpertLayersRatio",
        "llamaAccelerationOffloadRatio",
        { machineDependent: true, isExperimental: true },
        "off",
      )
      .scope("llama", builder =>
        builder
          .scope("acceleration", builder =>
            builder.field(
              "offloadRatio",
              "llamaAccelerationOffloadRatio",
              { machineDependent: true },
              "max",
            ),
          )
          .field("cpuThreadPoolSize", "numeric", { min: 1, machineDependent: true }, 4)
          .field("evalBatchSize", "numeric", { min: 1, int: true }, 512)
          .field(
            "flashAttention",
            "boolean",
            { isExperimental: true, warning: "config:flashAttentionWarning" },
            false,
          )
          .field(
            "ropeFrequencyBase",
            "checkboxNumeric",
            { min: 0, uncheckedHint: "config:ropeFrequencyBaseUncheckedHint" },
            { checked: false, value: 0 },
          )
          .field(
            "ropeFrequencyScale",
            "checkboxNumeric",
            { min: 0, uncheckedHint: "config:ropeFrequencyScaleUncheckedHint" },
            { checked: false, value: 0 },
          )
          .field("keepModelInMemory", "boolean", {}, true)
          .field("useFp16ForKVCache", "boolean", {}, true)
          .field("tryMmap", "boolean", {}, true)
          .field(
            "kCacheQuantizationType",
            "llamaCacheQuantizationType",
            { isExperimental: true },
            { checked: false, value: "f16" },
          )
          .field(
            "vCacheQuantizationType",
            "llamaCacheQuantizationType",
            { isExperimental: true, warning: "config:llamaKvCacheQuantizationWarning" },
            { checked: false, value: "f16" },
          ),
      )
      .scope("mlx", builder =>
        builder.field(
          "kvCacheQuantization",
          "mlxKvCacheQuantizationType",
          { isExperimental: true },
          { enabled: false, bits: 8, groupSize: 64, quantizedStart: 5000 },
        ),
      ),
  )
  .scope("load", builder =>
    builder
      .field("gpuSplitConfig", "gpuSplitConfig", {}, defaultGPUSplitConfig)
      .field("gpuStrictVramCap", "boolean", {}, false),
  )
  .scope("embedding.load", builder =>
    builder
      .field("contextLength", "contextLength", { machineDependent: true }, 2048)
      .field(
        "seed",
        "checkboxNumeric",
        { int: true, min: -1, uncheckedHint: "config:seedUncheckedHint" },
        { checked: false, value: -1 },
      )
      .scope("llama", builder =>
        builder
          .scope("acceleration", builder =>
            builder.field(
              "offloadRatio",
              "llamaAccelerationOffloadRatio",
              { machineDependent: true },
              "max",
            ),
          )
          .field("evalBatchSize", "numeric", { min: 1, int: true }, 512)
          .field(
            "ropeFrequencyBase",
            "checkboxNumeric",
            { min: 0, uncheckedHint: "config:ropeFrequencyBaseUncheckedHint" },
            { checked: false, value: 0 },
          )
          .field(
            "ropeFrequencyScale",
            "checkboxNumeric",
            { min: 0, uncheckedHint: "config:ropeFrequencyScaleUncheckedHint" },
            { checked: false, value: 0 },
          )
          .field("keepModelInMemory", "boolean", {}, true)
          .field("tryMmap", "boolean", {}, true),
      ),
  )
  .scope("retrieval", builder =>
    builder
      .field("databaseFile", "string", { machineDependent: true }, "")
      .field(
        "chunkingMethod",
        "retrievalChunkingMethod",
        {},
        {
          type: "recursive-v1",
          chunkSize: 512,
          chunkOverlap: 100,
        },
      )
      .field("limit", "numeric", { min: 1, int: true }, 5)
      .field("embeddingModel", "modelIdentifier", { domain: ["embedding"] }, ""),
  )
  .build();

// ------------------------------------
//  2. Functionality scope definitions
// ------------------------------------

export const llmPredictionConfigSchematics = globalConfigSchematics.scoped("llm.prediction");

export const llmSharedPredictionConfigSchematics = llmPredictionConfigSchematics.sliced(
  "temperature",
  "maxPredictedTokens",
  "promptTemplate",
  "systemPrompt",
  "seed",
  "contextPrefill",
  "tools",
  "toolChoice",
  "toolNaming",
  "reasoning.*",
);

export const llmLlamaPredictionConfigSchematics = llmSharedPredictionConfigSchematics.union(
  llmPredictionConfigSchematics.sliced(
    "llama.*",
    "contextOverflowPolicy",
    "stopStrings",
    "toolCallStopStrings",
    "structured",
    "topKSampling",
    "repeatPenalty",
    "minPSampling",
    "topPSampling",
    "logProbs",
    "speculativeDecoding.draftModel",
    "speculativeDecoding.minContinueDraftingProbability",
    "speculativeDecoding.minDraftLengthToConsider",
    "speculativeDecoding.maxTokensToDraft",
    "speculativeDecoding.numReuseTokens",
  ),
);

export const llmMlxPredictionConfigSchematics = llmSharedPredictionConfigSchematics.union(
  llmPredictionConfigSchematics.sliced(
    "mlx.*",
    "contextOverflowPolicy",
    "stopStrings",
    "toolCallStopStrings",
    "structured",
    "repeatPenalty",
    "minPSampling",
    "topPSampling",
    "topKSampling",
    "speculativeDecoding.draftModel",
    "speculativeDecoding.numDraftTokensExact",
  ),
);

export const llmTransformersPredictionConfigSchematics = llmSharedPredictionConfigSchematics.union(
  llmPredictionConfigSchematics.sliced("transformers.*"),
);

export const llmOnnxPredictionConfigSchematics = llmSharedPredictionConfigSchematics.union(
  llmPredictionConfigSchematics.sliced("onnx.*", "repeatPenalty", "topPSampling", "topKSampling"),
);

export const llmMistralrsPredictionConfigSchematics = llmSharedPredictionConfigSchematics;

export const llmLoadSchematics = globalConfigSchematics
  .scoped("llm.load")
  .union(globalConfigSchematics.sliced("envVars"))
  .union(globalConfigSchematics.scoped("load"));

export const llmSharedLoadConfigSchematics = llmLoadSchematics.sliced(
  "contextLength",
  "seed",
  "envVars",
);

const llamaLoadConfigSchematics = globalConfigSchematics.sliced("llama.load.*", "load.*");

export const llmLlamaLoadConfigSchematics = llmSharedLoadConfigSchematics
  .union(llmLoadSchematics.sliced("llama.*", "load.*", "offloadKVCacheToGpu"))
  .union(llamaLoadConfigSchematics);

export const llmMlxLoadConfigSchematics = llmSharedLoadConfigSchematics.union(
  llmLoadSchematics.sliced("mlx.*"),
);

export const llmTransformersLoadConfigSchematics = llmSharedLoadConfigSchematics.union(
  llmLoadSchematics.sliced("transformers.*"),
);

export const llmOnnxLoadConfigSchematics = llmSharedLoadConfigSchematics.union(
  llmLoadSchematics.sliced("onnx.*"),
);

const llmLlamaMoeAdditionalLoadConfigSchematics = llmLoadSchematics.sliced(
  "numExperts",
  "numCpuExpertLayersRatio",
);

export const llmLlamaMoeLoadConfigSchematics = llmLlamaLoadConfigSchematics.union(
  llmLlamaMoeAdditionalLoadConfigSchematics,
);

export const llmMistralrsLoadConfigSchematics = llmSharedLoadConfigSchematics;

export const embeddingLoadSchematics = globalConfigSchematics
  .scoped("embedding.load")
  .union(globalConfigSchematics.sliced("load.*"));

export const embeddingSharedLoadConfigSchematics = embeddingLoadSchematics.sliced(
  "contextLength",
  "seed",
);

export const retrievalSchematics = globalConfigSchematics.scoped("retrieval");

export const embeddingLlamaLoadConfigSchematics = embeddingSharedLoadConfigSchematics
  .union(embeddingLoadSchematics.sliced("llama.*"))
  .union(llamaLoadConfigSchematics);

export const emptyConfigSchematics = new KVConfigSchematicsBuilder(kvValueTypesLibrary).build();
export const customFieldConfigSchematics = new KVConfigSchematicsBuilder(kvValueTypesLibrary)
  .extension(VIRTUAL_MODEL_CUSTOM_FIELD_EXTENSION_PREFIX)
  .build();
// ------------------
//  3. Utility types
// ------------------

/**
 * LM Studio recognized config schematics.
 */
export type GlobalConfigSchematics = typeof globalConfigSchematics;

type ValueTypeMap =
  typeof kvValueTypesLibrary extends KVFieldValueTypeLibrary<infer RValueTypeMap>
    ? RValueTypeMap
    : never;

/**
 * Any config schematics that uses the value types defined in the type library.
 */
export type TypedConfigSchematics = KVConfigSchematics<ValueTypeMap, any>;

/**
 * Any field filter that uses the value types defined in the type library.
 */
export type TypedConfigFieldFilter = InferConfigFieldFilter<TypedConfigSchematics>;

export type GlobalKVValueTypeMap = InferValueTypeMap<typeof kvValueTypesLibrary>;
/**
 * All the value type keys
 */
export type GlobalKVValueTypeKeys = InferValueTypeKeys<typeof kvValueTypesLibrary>;
/**
 * Given a value type key, look up the typescript type of the value
 */
export type GlobalKVValueTypeValueTypeForKey<TKey extends GlobalKVValueTypeKeys> =
  GlobalKVValueTypeMap[TKey]["value"];
/**
 * Given a value type key, look up the typescript type of the param
 */
export type GlobalKVValueTypeParamTypeForKey<TKey extends GlobalKVValueTypeKeys> =
  GlobalKVValueTypeMap[TKey]["param"];

export type GlobalConfigSchemaMap = InferConfigSchemaMap<typeof globalConfigSchematics>;
/**
 * All the config keys
 */
export type GlobalConfigSchemaKeys = InferConfigSchemaKeys<typeof globalConfigSchematics>;
/**
 * Given a config key, look up the typescript type of the value
 */
export type GlobalConfigSchemaTypeForKey<TKey extends GlobalConfigSchemaKeys> =
  GlobalConfigSchemaMap[TKey]["type"];
/**
 * Given a config key, look up the value type key
 */
export type GlobalConfigSchemaValueTypeKeyForKey<TKey extends GlobalConfigSchemaKeys> =
  GlobalConfigSchemaMap[TKey]["valueTypeKey"];
