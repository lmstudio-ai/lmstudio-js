import { z, type ZodSchema } from "zod";
import { contentBlockStyleSchema, type ContentBlockStyle } from "../ContentBlockStyle.js";
import { llmGenInfoSchema, type LLMGenInfo } from "../LLMPredictionStats.js";

export type BlockLocation =
  | {
      type: "beforeId";
      id: string;
    }
  | {
      type: "afterId";
      id: string;
    };
export const blockLocationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("beforeId"),
    id: z.string(),
  }),
  z.object({
    type: z.literal("afterId"),
    id: z.string(),
  }),
]) as z.Schema<BlockLocation>;

// Status

/**
 * @public
 */
export type StatusStepStatus = "waiting" | "loading" | "done" | "error" | "canceled";
export const statusStepStatusSchema = z.enum([
  "waiting",
  "loading",
  "done",
  "error",
  "canceled",
]) as z.Schema<StatusStepStatus>;

/**
 * @public
 */
export interface StatusStepState {
  status: StatusStepStatus;
  text: string;
}
export const statusStepStateSchema = z.object({
  status: statusStepStatusSchema,
  text: z.string(),
}) as z.Schema<StatusStepState>;

export type ProcessingUpdateStatusCreate = {
  type: "status.create";
  id: string;
  state: StatusStepState;
  location?: BlockLocation;
  indentation?: number;
};
export const processingUpdateStatusCreateSchema = z.object({
  type: z.literal("status.create"),
  id: z.string(),
  state: statusStepStateSchema,
  location: blockLocationSchema.optional(),
  indentation: z.number().int().optional(),
});

export type ProcessingUpdateStatusUpdate = {
  type: "status.update";
  id: string;
  state: StatusStepState;
};
export const processingUpdateStatusUpdateSchema = z.object({
  type: z.literal("status.update"),
  id: z.string(),
  state: statusStepStateSchema,
});

export type ProcessingUpdateStatusRemove = {
  type: "status.remove";
  id: string;
};
export const processingUpdateStatusRemoveSchema = z.object({
  type: z.literal("status.remove"),
  id: z.string(),
});

export type ProcessingUpdateCitationBlockCreate = {
  type: "citationBlock.create";
  id: string;
  citedText: string;
  fileName: string;
  fileIdentifier: string;
  pageNumber?: number | [start: number, end: number];
  lineNumber?: number | [start: number, end: number];
};
export const processingUpdateCitationBlockCreateSchema = z.object({
  type: z.literal("citationBlock.create"),
  id: z.string(),
  citedText: z.string(),
  fileName: z.string(),
  fileIdentifier: z.string(),
  pageNumber: z.union([z.number().int(), z.tuple([z.number().int(), z.number().int()])]).optional(),
  lineNumber: z.union([z.number().int(), z.tuple([z.number().int(), z.number().int()])]).optional(),
});

// Debug Info Block

export type ProcessingUpdateDebugInfoBlockCreate = {
  type: "debugInfoBlock.create";
  id: string;
  debugInfo: string;
};
export const processingUpdateDebugInfoBlockCreateSchema = z.object({
  type: z.literal("debugInfoBlock.create"),
  id: z.string(),
  debugInfo: z.string(),
});

// Content block

export type ProcessingUpdateContentBlockCreate = {
  type: "contentBlock.create";
  id: string;
  includeInContext: boolean;
  style?: ContentBlockStyle;
  prefix?: string;
  suffix?: string;
};
export const processingUpdateContentBlockCreateSchema = z.object({
  type: z.literal("contentBlock.create"),
  id: z.string(),
  includeInContext: z.boolean(),
  style: contentBlockStyleSchema.optional(),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
});

export type ProcessingUpdateContentBlockAppendText = {
  type: "contentBlock.appendText";
  id: string;
  text: string;
};
export const processingUpdateContentBlockAppendTextSchema = z.object({
  type: z.literal("contentBlock.appendText"),
  id: z.string(),
  text: z.string(),
});

export type ProcessingUpdateContentBlockReplaceText = {
  type: "contentBlock.replaceText";
  id: string;
  text: string;
};
export const processingUpdateContentBlockReplaceTextSchema = z.object({
  type: z.literal("contentBlock.replaceText"),
  id: z.string(),
  text: z.string(),
});

export type ProcessingUpdateContentBlockAttachGenInfo = {
  type: "contentBlock.attachGenInfo";
  id: string;
  genInfo: LLMGenInfo;
};
export const processingUpdateContentBlockAttachGenInfoSchema = z.object({
  type: z.literal("contentBlock.attachGenInfo"),
  id: z.string(),
  genInfo: llmGenInfoSchema,
});

export type ProcessingUpdateSetSenderName = {
  type: "setSenderName";
  name: string;
};
export const processingUpdateSetSenderNameSchema = z.object({
  type: z.literal("setSenderName"),
  name: z.string(),
});

// Combined

export type ProcessingUpdate =
  | ProcessingUpdateStatusCreate
  | ProcessingUpdateStatusUpdate
  | ProcessingUpdateStatusRemove
  | ProcessingUpdateCitationBlockCreate
  | ProcessingUpdateDebugInfoBlockCreate
  | ProcessingUpdateContentBlockCreate
  | ProcessingUpdateContentBlockAppendText
  | ProcessingUpdateContentBlockReplaceText
  | ProcessingUpdateContentBlockAttachGenInfo
  | ProcessingUpdateSetSenderName;
export const processingUpdateSchema = z.discriminatedUnion("type", [
  processingUpdateStatusCreateSchema,
  processingUpdateStatusUpdateSchema,
  processingUpdateStatusRemoveSchema,
  processingUpdateCitationBlockCreateSchema,
  processingUpdateDebugInfoBlockCreateSchema,
  processingUpdateContentBlockCreateSchema,
  processingUpdateContentBlockAppendTextSchema,
  processingUpdateContentBlockReplaceTextSchema,
  processingUpdateContentBlockAttachGenInfoSchema,
  processingUpdateSetSenderNameSchema,
]) as ZodSchema<ProcessingUpdate>;

export type ProcessingUpdateType = ProcessingUpdate["type"];

export type ProcessingUpdateOf<TType extends ProcessingUpdate["type"]> = Extract<
  ProcessingUpdate,
  { type: TType }
>;
