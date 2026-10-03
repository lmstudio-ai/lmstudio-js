import { z } from "zod";
import {
  modelInfoBaseSchema,
  modelInstanceInfoBaseSchema,
  type ModelInfoBase,
  type ModelInstanceInfoBase,
} from "../ModelInfoBase.js";

/** Decision model metadata. Compatibility is determined by the engine, not this declaration. @public */
export interface DecisionModelAdditionalInfo {
  /** Raw GGUF declaration, retained verbatim when present. */
  decisionType?: string;
  /** Authoritative metadata only; absent when the model does not declare it. */
  maxContextLength?: number;
  /** An associated projector exists; this does not guarantee image support. */
  hasVisionAdapter: boolean;
}
export const decisionModelAdditionalInfoSchema = z.object({
  decisionType: z.string().optional(),
  maxContextLength: z.number().int().positive().optional(),
  hasVisionAdapter: z.boolean(),
});

/** Actualized information for a loaded decision instance. @public */
export interface DecisionModelInstanceAdditionalInfo {
  contextLength: number;
}
export const decisionModelInstanceAdditionalInfoSchema = z.object({
  contextLength: z.number().int().positive(),
});

/** @public */
export type DecisionModelInfo = { type: "decision" } & ModelInfoBase & DecisionModelAdditionalInfo;
export const decisionModelInfoSchema = z
  .object({ type: z.literal("decision") })
  .extend(modelInfoBaseSchema.shape)
  .extend(decisionModelAdditionalInfoSchema.shape);

/** @public */
export type DecisionModelInstanceInfo = { type: "decision" } & ModelInstanceInfoBase &
  DecisionModelAdditionalInfo &
  DecisionModelInstanceAdditionalInfo;
export const decisionModelInstanceInfoSchema = z
  .object({ type: z.literal("decision") })
  .extend(modelInstanceInfoBaseSchema.shape)
  .extend(decisionModelAdditionalInfoSchema.shape)
  .extend(decisionModelInstanceAdditionalInfoSchema.shape);
