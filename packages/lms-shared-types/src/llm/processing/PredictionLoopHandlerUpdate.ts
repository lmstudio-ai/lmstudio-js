import { z } from "zod";
import {
  processingUpdateCitationBlockCreateSchema,
  processingUpdateContentBlockAppendTextSchema,
  processingUpdateContentBlockAppendToolRequestSchema,
  processingUpdateContentBlockAppendToolResultSchema,
  processingUpdateContentBlockAttachGenInfoSchema,
  processingUpdateContentBlockCreateSchema,
  processingUpdateContentBlockReplaceTextSchema,
  processingUpdateContentBlockReplaceToolRequestSchema,
  processingUpdateContentBlockSetStyleSchema,
  processingUpdateDebugInfoBlockCreateSchema,
  processingUpdateSetSenderNameSchema,
  processingUpdateStatusCreateSchema,
  processingUpdateStatusRemoveSchema,
  processingUpdateStatusUpdateSchema,
  processingUpdateToolStatusCreateSchema,
  processingUpdateToolStatusUpdateSchema,
  type ProcessingUpdateCitationBlockCreate,
  type ProcessingUpdateContentBlockAppendText,
  type ProcessingUpdateContentBlockAppendToolRequest,
  type ProcessingUpdateContentBlockAppendToolResult,
  type ProcessingUpdateContentBlockAttachGenInfo,
  type ProcessingUpdateContentBlockCreate,
  type ProcessingUpdateContentBlockReplaceText,
  type ProcessingUpdateContentBlockReplaceToolRequest,
  type ProcessingUpdateContentBlockSetStyle,
  type ProcessingUpdateDebugInfoBlockCreate,
  type ProcessingUpdateSetSenderName,
  type ProcessingUpdateStatusCreate,
  type ProcessingUpdateStatusRemove,
  type ProcessingUpdateStatusUpdate,
  type ProcessingUpdateToolStatusCreate,
  type ProcessingUpdateToolStatusUpdate,
} from "./ProcessingUpdate.js";

export type PredictionLoopHandlerUpdate =
  | ProcessingUpdateStatusCreate
  | ProcessingUpdateStatusUpdate
  | ProcessingUpdateStatusRemove
  | ProcessingUpdateCitationBlockCreate
  | ProcessingUpdateDebugInfoBlockCreate
  | ProcessingUpdateContentBlockCreate
  | ProcessingUpdateContentBlockAppendText
  | ProcessingUpdateContentBlockReplaceText
  | ProcessingUpdateContentBlockAppendToolRequest
  | ProcessingUpdateContentBlockReplaceToolRequest
  | ProcessingUpdateContentBlockAppendToolResult
  | ProcessingUpdateContentBlockAttachGenInfo
  | ProcessingUpdateContentBlockSetStyle
  | ProcessingUpdateToolStatusCreate
  | ProcessingUpdateToolStatusUpdate
  | ProcessingUpdateSetSenderName;
export const predictionLoopHandlerUpdateSchema = z.discriminatedUnion("type", [
  processingUpdateStatusCreateSchema,
  processingUpdateStatusUpdateSchema,
  processingUpdateStatusRemoveSchema,
  processingUpdateCitationBlockCreateSchema,
  processingUpdateDebugInfoBlockCreateSchema,
  processingUpdateContentBlockCreateSchema,
  processingUpdateContentBlockAppendTextSchema,
  processingUpdateContentBlockReplaceTextSchema,
  processingUpdateContentBlockAppendToolRequestSchema,
  processingUpdateContentBlockReplaceToolRequestSchema,
  processingUpdateContentBlockAppendToolResultSchema,
  processingUpdateContentBlockAttachGenInfoSchema,
  processingUpdateContentBlockSetStyleSchema,
  processingUpdateToolStatusCreateSchema,
  processingUpdateToolStatusUpdateSchema,
  processingUpdateSetSenderNameSchema,
]) as z.Schema<PredictionLoopHandlerUpdate>;
