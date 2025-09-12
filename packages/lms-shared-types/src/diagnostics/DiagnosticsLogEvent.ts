import { z } from "zod";
import { type LogLevel, logLevelSchema } from "../LogLevel.js";
import { llmPredictionStatsSchema, type LLMPredictionStats } from "../llm/LLMPredictionStats.js";

export const diagnosticsLogInputEventDataSchema = z.object({
  type: z.literal("llm.prediction.input"),
  input: z.string(),
  modelPath: z.string(),
  modelIdentifier: z.string(),
});

export const diagnosticsLogOutputEventDataSchema = z.object({
  type: z.literal("llm.prediction.output"),
  output: z.string(),
  stats: llmPredictionStatsSchema.optional(),
  modelIdentifier: z.string(),
});

export const diagnosticsLogServerEventDataSchema = z.object({
  type: z.literal("server.log"),
  content: z.string(),
  level: logLevelSchema,
});

export const diagnosticsLogEventDataSchema = z.discriminatedUnion("type", [
  diagnosticsLogInputEventDataSchema,
  diagnosticsLogOutputEventDataSchema,
  diagnosticsLogServerEventDataSchema,
]);

/**
 * @public
 */
export type DiagnosticsLogInputEventData = {
  type: "llm.prediction.input";
  input: string;
  modelPath: string;
  modelIdentifier: string;
};

/**
 * @public
 */
export type DiagnosticsLogOutputEventData = {
  type: "llm.prediction.output";
  output: string;
  stats?: LLMPredictionStats;
  modelIdentifier: string;
};

/**
 * @public
 */
export type DiagnosticsLogServerEventData = {
  type: "server.log";
  content: string;
  level: LogLevel;
};

/**
 * @public
 */
export type DiagnosticsLogEventData =
  | DiagnosticsLogInputEventData
  | DiagnosticsLogOutputEventData
  | DiagnosticsLogServerEventData;

export const diagnosticsLogEventSchema = z.object({
  timestamp: z.number(),
  data: diagnosticsLogEventDataSchema,
});

/**
 * @public
 */
export type DiagnosticsLogEvent = {
  timestamp: number;
  data: DiagnosticsLogEventData;
};
