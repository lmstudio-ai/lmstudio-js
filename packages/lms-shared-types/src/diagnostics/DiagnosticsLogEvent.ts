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

export const diagnosticsLogRuntimeEventDataSchema = z.object({
  type: z.literal("runtime.log"),
  level: logLevelSchema,
  message: z.string(),
  engineName: z.string(),
  engineVersion: z.string(),
  engineType: z.string(),
  modelIdentifier: z.string().optional(),
  instanceReference: z.string().optional(),
  pid: z.number().int().optional(),
});

export const diagnosticsLogEventDataSchema = z.discriminatedUnion("type", [
  diagnosticsLogInputEventDataSchema,
  diagnosticsLogOutputEventDataSchema,
  diagnosticsLogServerEventDataSchema,
  diagnosticsLogRuntimeEventDataSchema,
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
export type DiagnosticsLogRuntimeEventData = {
  type: "runtime.log";
  level: LogLevel;
  message: string;
  engineName: string;
  engineVersion: string;
  engineType: string;
  modelIdentifier?: string;
  instanceReference?: string;
  pid?: number;
};

/**
 * @public
 */
export type DiagnosticsLogEventData =
  | DiagnosticsLogInputEventData
  | DiagnosticsLogOutputEventData
  | DiagnosticsLogServerEventData
  | DiagnosticsLogRuntimeEventData;

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
