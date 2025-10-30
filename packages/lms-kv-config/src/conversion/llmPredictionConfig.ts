import { type KVConfig, type LLMPredictionConfig } from "@lmstudio/lms-shared-types";
import { collapseKVStackRaw } from "../KVConfig.js";
import { llmPredictionConfigSchematics } from "../schema.js";
import { maybeFalseValueToCheckboxValue } from "./utils.js";

interface KvConfigToLLMPredictionConfigOpts {
  /**
   * Fills the missing keys passed in with default values
   */
  useDefaultsForMissingKeys?: boolean;
}

export function kvConfigToLLMPredictionConfig(
  config: KVConfig,
  { useDefaultsForMissingKeys }: KvConfigToLLMPredictionConfigOpts = {},
) {
  const result: LLMPredictionConfig = {};
  let parsed;
  if (useDefaultsForMissingKeys === true) {
    parsed = llmPredictionConfigSchematics.parse(config);
  } else {
    parsed = llmPredictionConfigSchematics.parsePartial(config);
  }
  const maxPredictedTokens = parsed.get("maxPredictedTokens");
  if (maxPredictedTokens !== undefined) {
    result.maxTokens = maxPredictedTokens.checked ? maxPredictedTokens.value : false;
  }
  const temperature = parsed.get("temperature");
  if (temperature !== undefined) {
    result.temperature = temperature;
  }

  const stopStrings = parsed.get("stopStrings");
  if (stopStrings !== undefined) {
    result.stopStrings = stopStrings;
  }

  const toolCallStopStrings = parsed.get("toolCallStopStrings");
  if (toolCallStopStrings !== undefined) {
    result.toolCallStopStrings = toolCallStopStrings;
  }

  const contextOverflowPolicy = parsed.get("contextOverflowPolicy");
  if (contextOverflowPolicy !== undefined) {
    result.contextOverflowPolicy = contextOverflowPolicy;
  }

  const structured = parsed.get("structured");
  if (structured !== undefined) {
    result.structured = structured;
  }

  const tools = parsed.get("tools");
  if (tools !== undefined) {
    result.rawTools = tools;
  }

  const toolChoice = parsed.get("toolChoice");
  if (toolChoice !== undefined) {
    result.toolChoice = toolChoice;
  }

  const toolNaming = parsed.get("toolNaming");
  if (toolNaming !== undefined) {
    result.toolNaming = toolNaming;
  }

  const topKSampling = parsed.get("topKSampling");
  if (topKSampling !== undefined) {
    result.topKSampling = topKSampling;
  }

  const repeatPenalty = parsed.get("repeatPenalty");
  if (repeatPenalty !== undefined) {
    result.repeatPenalty = repeatPenalty.checked ? repeatPenalty.value : false;
  }

  const minPSampling = parsed.get("minPSampling");
  if (minPSampling !== undefined) {
    result.minPSampling = minPSampling.checked ? minPSampling.value : false;
  }

  const topPSampling = parsed.get("topPSampling");
  if (topPSampling !== undefined) {
    result.topPSampling = topPSampling.checked ? topPSampling.value : false;
  }

  const xtcProbability = parsed.get("llama.xtcProbability");
  if (xtcProbability !== undefined) {
    result.xtcProbability = xtcProbability.checked ? xtcProbability.value : false;
  }

  const xtcThreshold = parsed.get("llama.xtcThreshold");
  if (xtcThreshold !== undefined) {
    result.xtcThreshold = xtcThreshold.checked ? xtcThreshold.value : false;
  }

  const logProbs = parsed.get("logProbs");
  if (logProbs !== undefined) {
    result.logProbs = logProbs.checked ? logProbs.value : false;
  }

  const cpuThreads = parsed.get("llama.cpuThreads");
  if (cpuThreads !== undefined) {
    result.cpuThreads = cpuThreads;
  }

  const promptTemplate = parsed.get("promptTemplate");
  if (promptTemplate !== undefined) {
    result.promptTemplate = promptTemplate;
  }

  const speculativeDecodingDraftModel = parsed.get("speculativeDecoding.draftModel");
  if (speculativeDecodingDraftModel !== undefined) {
    result.draftModel = speculativeDecodingDraftModel;
  }

  const speculativeDecodingDraftTokensExact = parsed.get("speculativeDecoding.numDraftTokensExact");
  if (speculativeDecodingDraftTokensExact !== undefined) {
    result.speculativeDecodingNumDraftTokensExact = speculativeDecodingDraftTokensExact;
  }

  const speculativeDecodingMinContinueDraftingProbability = parsed.get(
    "speculativeDecoding.minContinueDraftingProbability",
  );
  if (speculativeDecodingMinContinueDraftingProbability !== undefined) {
    result.speculativeDecodingMinContinueDraftingProbability =
      speculativeDecodingMinContinueDraftingProbability;
  }

  const speculativeDecodingMinDraftLengthToConsider = parsed.get(
    "speculativeDecoding.minDraftLengthToConsider",
  );
  if (speculativeDecodingMinDraftLengthToConsider !== undefined) {
    result.speculativeDecodingMinDraftLengthToConsider =
      speculativeDecodingMinDraftLengthToConsider;
  }

  const reasoningParsing = parsed.get("reasoning.parsing");
  if (reasoningParsing !== undefined) {
    result.reasoningParsing = reasoningParsing;
  }

  const userMaxImageDimensionPixels = parsed.get("vision.userMaxImageDimensionPixels");
  if (userMaxImageDimensionPixels !== undefined) {
    result.userMaxImageDimensionPixels = userMaxImageDimensionPixels.checked
      ? userMaxImageDimensionPixels.value
      : false;
  }

  const ignoreModelPreferredMaxImageDimension = parsed.get(
    "vision.ignoreModelPreferredMaxImageDimension",
  );
  if (ignoreModelPreferredMaxImageDimension !== undefined) {
    result.ignoreModelPreferredMaxImageDimension = ignoreModelPreferredMaxImageDimension;
  }

  result.raw = config;

  return result;
}

export function llmPredictionConfigToKVConfig(config: LLMPredictionConfig): KVConfig {
  const top = llmPredictionConfigSchematics.buildPartialConfig({
    "temperature": config.temperature,
    "contextOverflowPolicy": config.contextOverflowPolicy,
    "maxPredictedTokens": maybeFalseValueToCheckboxValue(config.maxTokens, 1),
    "stopStrings": config.stopStrings,
    "toolCallStopStrings": config.toolCallStopStrings,
    "structured": config.structured,
    "tools": config.rawTools,
    "toolChoice": config.toolChoice,
    "toolNaming": config.toolNaming,
    "topKSampling": config.topKSampling,
    "repeatPenalty": maybeFalseValueToCheckboxValue(config.repeatPenalty, 1.1),
    "minPSampling": maybeFalseValueToCheckboxValue(config.minPSampling, 0.05),
    "topPSampling": maybeFalseValueToCheckboxValue(config.topPSampling, 0.95),
    "llama.xtcProbability": maybeFalseValueToCheckboxValue(config.xtcProbability, 0),
    "llama.xtcThreshold": maybeFalseValueToCheckboxValue(config.xtcThreshold, 0),
    "logProbs": maybeFalseValueToCheckboxValue(config.logProbs, 0),
    "llama.cpuThreads": config.cpuThreads,
    "promptTemplate": config.promptTemplate,
    "speculativeDecoding.draftModel": config.draftModel,
    "speculativeDecoding.numDraftTokensExact": config.speculativeDecodingNumDraftTokensExact,
    "speculativeDecoding.minDraftLengthToConsider":
      config.speculativeDecodingMinDraftLengthToConsider,
    "speculativeDecoding.minContinueDraftingProbability":
      config.speculativeDecodingMinContinueDraftingProbability,
    "reasoning.parsing": config.reasoningParsing,
    "vision.userMaxImageDimensionPixels": maybeFalseValueToCheckboxValue(
      config.userMaxImageDimensionPixels,
      1024,
    ),
    "vision.ignoreModelPreferredMaxImageDimension": config.ignoreModelPreferredMaxImageDimension,
  });
  if (config.raw !== undefined) {
    return collapseKVStackRaw([config.raw, top]);
  }
  return top;
}
