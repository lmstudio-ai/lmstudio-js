import { z } from "zod";
import {
  processingUpdateCitationBlockCreateSchema,
  processingUpdateContentBlockAppendTextSchema,
  processingUpdateContentBlockAppendToolRequestSchema,
  processingUpdateContentBlockAppendToolResultSchema,
  processingUpdateContentBlockAttachGenInfoSchema,
  processingUpdateContentBlockCreateSchema,
  processingUpdateContentBlockReplaceTextSchema,
  processingUpdateContentBlockSetStyleSchema,
  processingUpdateDebugInfoBlockCreateSchema,
  processingUpdateSetSenderNameSchema,
  processingUpdateStatusCreateSchema,
  processingUpdateStatusRemoveSchema,
  processingUpdateStatusUpdateSchema,
  type ProcessingUpdateCitationBlockCreate,
  type ProcessingUpdateContentBlockAppendText,
  type ProcessingUpdateContentBlockAppendToolRequest,
  type ProcessingUpdateContentBlockAppendToolResult,
  type ProcessingUpdateContentBlockAttachGenInfo,
  type ProcessingUpdateContentBlockCreate,
  type ProcessingUpdateContentBlockReplaceText,
  type ProcessingUpdateContentBlockSetStyle,
  type ProcessingUpdateDebugInfoBlockCreate,
  type ProcessingUpdateSetSenderName,
  type ProcessingUpdateStatusCreate,
  type ProcessingUpdateStatusRemove,
  type ProcessingUpdateStatusUpdate,
} from "./ProcessingUpdate.js";

export type GeneratorUpdate =
  | ProcessingUpdateStatusCreate
  | ProcessingUpdateStatusUpdate
  | ProcessingUpdateStatusRemove
  | ProcessingUpdateCitationBlockCreate
  | ProcessingUpdateDebugInfoBlockCreate
  | ProcessingUpdateContentBlockCreate
  | ProcessingUpdateContentBlockAppendText
  | ProcessingUpdateContentBlockReplaceText
  | ProcessingUpdateContentBlockAppendToolRequest
  | ProcessingUpdateContentBlockAppendToolResult
  | ProcessingUpdateContentBlockAttachGenInfo
  | ProcessingUpdateContentBlockSetStyle
  | ProcessingUpdateSetSenderName;
export const generatorUpdateSchema = z.discriminatedUnion("type", [
  processingUpdateStatusCreateSchema,
  processingUpdateStatusUpdateSchema,
  processingUpdateStatusRemoveSchema,
  processingUpdateCitationBlockCreateSchema,
  processingUpdateDebugInfoBlockCreateSchema,
  processingUpdateContentBlockCreateSchema,
  processingUpdateContentBlockAppendTextSchema,
  processingUpdateContentBlockReplaceTextSchema,
  processingUpdateContentBlockAppendToolRequestSchema,
  processingUpdateContentBlockAppendToolResultSchema,
  processingUpdateContentBlockAttachGenInfoSchema,
  processingUpdateContentBlockSetStyleSchema,
  processingUpdateSetSenderNameSchema,
]) as z.Schema<GeneratorUpdate>;
