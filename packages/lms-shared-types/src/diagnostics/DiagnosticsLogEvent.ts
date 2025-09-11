import { z } from "zod";
import { type LogLevel } from "../index.js";
import { llmPredictionStatsSchema, type LLMPredictionStats } from "../llm/LLMPredictionStats.js";

export const diagnosticsLogEventDataSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("llm.prediction.input"),
    input: z.string(),
    modelPath: z.string(),
    modelIdentifier: z.string(),
  }),
  z.object({
    type: z.literal("llm.prediction.output"),
    output: z.string(),
    stats: llmPredictionStatsSchema.optional(),
    modelPath: z.string(),
    modelIdentifier: z.string(),
  }),
  z.object({
    type: z.literal("server.log"),
    content: z.string(),
    level: z.enum(["debug", "info", "warn", "error"]),
  }),
]);

type DiagnosticsLogInputEventData = {
  type: "llm.prediction.input";
  input: string;
  modelPath: string;
  modelIdentifier: string;
};
type DiagnosticsLogOutputEventData = {
  type: "llm.prediction.output";
  output: string;
  stats?: LLMPredictionStats;
  modelPath: string;
  modelIdentifier: string;
};

type DiagnosticsLogServerEventData = {
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
