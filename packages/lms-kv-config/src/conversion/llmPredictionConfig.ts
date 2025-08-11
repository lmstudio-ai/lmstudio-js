import { type KVConfig, type LLMPredictionConfig } from "@lmstudio/lms-shared-types";
import { collapseKVStackRaw } from "../KVConfig.js";
import { globalConfigSchematics, llmPredictionConfigSchematics } from "../schema.js";
import { maybeFalseNumberToCheckboxNumeric } from "./utils.js";

export function kvConfigToLLMPredictionConfig(config: KVConfig) {
  const result: LLMPredictionConfig = {};
  const parsed = globalConfigSchematics.parsePartial(config);

  const maxPredictedTokens = parsed.get("llm.prediction.maxPredictedTokens");
  if (maxPredictedTokens !== undefined) {
    result.maxTokens = maxPredictedTokens.checked ? maxPredictedTokens.value : false;
  }
  const temperature = parsed.get("llm.prediction.temperature");
  if (temperature !== undefined) {
    result.temperature = temperature;
  }

  const stopStrings = parsed.get("llm.prediction.stopStrings");
  if (stopStrings !== undefined) {
    result.stopStrings = stopStrings;
  }

  const toolCallStopStrings = parsed.get("llm.prediction.toolCallStopStrings");
  if (toolCallStopStrings !== undefined) {
    result.toolCallStopStrings = toolCallStopStrings;
  }

  const contextOverflowPolicy = parsed.get("llm.prediction.contextOverflowPolicy");
  if (contextOverflowPolicy !== undefined) {
    result.contextOverflowPolicy = contextOverflowPolicy;
  }

  const structured = parsed.get("llm.prediction.structured");
  if (structured !== undefined) {
    result.structured = structured;
  }

  const tools = parsed.get("llm.prediction.tools");
  if (tools !== undefined) {
    result.rawTools = tools;
  }

  const toolNaming = parsed.get("llm.prediction.toolNaming");
  if (toolNaming !== undefined) {
    result.toolNaming = toolNaming;
  }

  const topKSampling = parsed.get("llm.prediction.topKSampling");
  if (topKSampling !== undefined) {
    result.topKSampling = topKSampling;
  }

  const repeatPenalty = parsed.get("llm.prediction.repeatPenalty");
  if (repeatPenalty !== undefined) {
    result.repeatPenalty = repeatPenalty.checked ? repeatPenalty.value : false;
  }

  const minPSampling = parsed.get("llm.prediction.minPSampling");
  if (minPSampling !== undefined) {
    result.minPSampling = minPSampling.checked ? minPSampling.value : false;
  }

  const topPSampling = parsed.get("llm.prediction.topPSampling");
  if (topPSampling !== undefined) {
    result.topPSampling = topPSampling.checked ? topPSampling.value : false;
  }

  const xtcProbability = parsed.get("llm.prediction.llama.xtcProbability");
  if (xtcProbability !== undefined) {
    result.xtcProbability = xtcProbability.checked ? xtcProbability.value : false;
  }

  const xtcThreshold = parsed.get("llm.prediction.llama.xtcThreshold");
  if (xtcThreshold !== undefined) {
    result.xtcThreshold = xtcThreshold.checked ? xtcThreshold.value : false;
  }

  const logProbs = parsed.get("llm.prediction.logProbs");
  if (logProbs !== undefined) {
    result.logProbs = logProbs.checked ? logProbs.value : false;
  }

  const cpuThreads = parsed.get("llm.prediction.llama.cpuThreads");
  if (cpuThreads !== undefined) {
    result.cpuThreads = cpuThreads;
  }

  const promptTemplate = parsed.get("llm.prediction.promptTemplate");
  if (promptTemplate !== undefined) {
    result.promptTemplate = promptTemplate;
  }

  const speculativeDecodingDraftModel = parsed.get("llm.prediction.speculativeDecoding.draftModel");
  if (speculativeDecodingDraftModel !== undefined) {
    result.draftModel = speculativeDecodingDraftModel;
  }

  const speculativeDecodingDraftTokensExact = parsed.get(
    "llm.prediction.speculativeDecoding.numDraftTokensExact",
  );
  if (speculativeDecodingDraftTokensExact !== undefined) {
    result.speculativeDecodingNumDraftTokensExact = speculativeDecodingDraftTokensExact;
  }

  const speculativeDecodingMinContinueDraftingProbability = parsed.get(
    "llm.prediction.speculativeDecoding.minContinueDraftingProbability",
  );
  if (speculativeDecodingMinContinueDraftingProbability !== undefined) {
    result.speculativeDecodingMinContinueDraftingProbability =
      speculativeDecodingMinContinueDraftingProbability;
  }

  const speculativeDecodingMinDraftLengthToConsider = parsed.get(
    "llm.prediction.speculativeDecoding.minDraftLengthToConsider",
  );
  if (speculativeDecodingMinDraftLengthToConsider !== undefined) {
    result.speculativeDecodingMinDraftLengthToConsider =
      speculativeDecodingMinDraftLengthToConsider;
  }

  const reasoningParsing = parsed.get("llm.prediction.reasoning.parsing");
  if (reasoningParsing !== undefined) {
    result.reasoningParsing = reasoningParsing;
  }

  result.raw = config;

  return result;
}

export function llmPredictionConfigToKVConfig(config: LLMPredictionConfig): KVConfig {
  const top = llmPredictionConfigSchematics.buildPartialConfig({
    "temperature": config.temperature,
    "contextOverflowPolicy": config.contextOverflowPolicy,
    "maxPredictedTokens": maybeFalseNumberToCheckboxNumeric(config.maxTokens, 1),
    "stopStrings": config.stopStrings,
    "toolCallStopStrings": config.toolCallStopStrings,
    "structured": config.structured,
    "tools": config.rawTools,
    "toolNaming": config.toolNaming,
    "topKSampling": config.topKSampling,
    "repeatPenalty": maybeFalseNumberToCheckboxNumeric(config.repeatPenalty, 1.1),
    "minPSampling": maybeFalseNumberToCheckboxNumeric(config.minPSampling, 0.05),
    "topPSampling": maybeFalseNumberToCheckboxNumeric(config.topPSampling, 0.95),
    "llama.xtcProbability": maybeFalseNumberToCheckboxNumeric(config.xtcProbability, 0),
    "llama.xtcThreshold": maybeFalseNumberToCheckboxNumeric(config.xtcThreshold, 0),
    "logProbs": maybeFalseNumberToCheckboxNumeric(config.logProbs, 0),
    "llama.cpuThreads": config.cpuThreads,
    "promptTemplate": config.promptTemplate,
    "speculativeDecoding.draftModel": config.draftModel,
    "speculativeDecoding.numDraftTokensExact": config.speculativeDecodingNumDraftTokensExact,
    "speculativeDecoding.minDraftLengthToConsider":
      config.speculativeDecodingMinDraftLengthToConsider,
    "speculativeDecoding.minContinueDraftingProbability":
      config.speculativeDecodingMinContinueDraftingProbability,
    "reasoning.parsing": config.reasoningParsing,
  });
  if (config.raw !== undefined) {
    return collapseKVStackRaw([config.raw, top]);
  }
  return top;
}
