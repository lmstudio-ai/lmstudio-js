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
  roleOverride?: "user" | "assistant" | "system" | "tool";
  style?: ContentBlockStyle;
  prefix?: string;
  suffix?: string;
};
export const processingUpdateContentBlockCreateSchema = z.object({
  type: z.literal("contentBlock.create"),
  id: z.string(),
  includeInContext: z.boolean(),
  roleOverride: z.enum(["user", "assistant", "system", "tool"]).optional(),
  style: contentBlockStyleSchema.optional(),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
});

export type ProcessingUpdateContentBlockAppendText = {
  type: "contentBlock.appendText";
  id: string;
  text: string;
  tokensCount?: number;
  fromDraftModel?: boolean;
  isStructural?: boolean;
};
export const processingUpdateContentBlockAppendTextSchema = z.object({
  type: z.literal("contentBlock.appendText"),
  id: z.string(),
  text: z.string(),
  tokensCount: z.number().int().optional(),
  fromDraftModel: z.boolean().optional(),
  isStructural: z.boolean().optional(),
});

export type ProcessingUpdateContentBlockAppendToolResult = {
  type: "contentBlock.appendToolResult";
  /**
   * ID of the content block.
   */
  id: string;
  /**
   * Call ID created by LM Studio. Used to pair up requests and responses.
   */
  callId: number;
  /**
   * Model specific optional tool call request ID (string).
   */
  toolCallRequestId?: string;
  /**
   * Result of the tool call.
   */
  content: string;
};
export const processingUpdateContentBlockAppendToolResultSchema = z.object({
  type: z.literal("contentBlock.appendToolResult"),
  id: z.string(),
  callId: z.number().int(),
  toolCallRequestId: z.string().optional(),
  content: z.string(),
});

export type ProcessingUpdateContentBlockAppendToolRequest = {
  type: "contentBlock.appendToolRequest";
  /**
   * ID of the content block.
   */
  id: string;
  /**
   * Call ID created by LM Studio. Used to pair up requests and responses.
   */
  callId: number;
  /**
   * Model specific optional tool call request ID (string).
   */
  toolCallRequestId?: string;
  /**
   * Name of the tool called.
   */
  name: string;
  /**
   * Arguments of the tool call.
   */
  parameters: Record<string, unknown>;
  /**
   * Optional identifier of the plugin that provided the tool.
   */
  pluginIdentifier?: string;
};
export const processingUpdateContentBlockAppendToolRequestSchema = z.object({
  type: z.literal("contentBlock.appendToolRequest"),
  id: z.string(),
  callId: z.number().int(),
  toolCallRequestId: z.string().optional(),
  name: z.string(),
  parameters: z.record(z.unknown()),
  pluginIdentifier: z.string().optional(),
});

export type ProcessingUpdateContentBlockReplaceToolRequest = {
  type: "contentBlock.replaceToolRequest";
  id: string;
  /**
   * Call ID created by LM Studio. Used to pair up requests and responses.
   */
  callId: number;
  /**
   * Model specific optional tool call request ID (string).
   */
  toolCallRequestId?: string;
  /**
   * Name of the tool called.
   */
  name: string;
  /**
   * Arguments of the tool call.
   */
  parameters: Record<string, unknown>;
  /**
   * Optional identifier of the plugin that provided the tool.
   */
  pluginIdentifier?: string;
};
export const processingUpdateContentBlockReplaceToolRequestSchema = z.object({
  type: z.literal("contentBlock.replaceToolRequest"),
  id: z.string(),
  callId: z.number().int(),
  toolCallRequestId: z.string().optional(),
  name: z.string(),
  parameters: z.record(z.unknown()),
  pluginIdentifier: z.string().optional(),
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

export type ProcessingUpdateContentBlockSetPrefix = {
  type: "contentBlock.setPrefix";
  id: string;
  prefix: string;
};
export const processingUpdateContentBlockSetPrefixSchema = z.object({
  type: z.literal("contentBlock.setPrefix"),
  id: z.string(),
  prefix: z.string(),
});

export type ProcessingUpdateContentBlockSetSuffix = {
  type: "contentBlock.setSuffix";
  id: string;
  suffix: string;
};
export const processingUpdateContentBlockSetSuffixSchema = z.object({
  type: z.literal("contentBlock.setSuffix"),
  id: z.string(),
  suffix: z.string(),
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

export type ProcessingUpdateContentBlockSetStyle = {
  type: "contentBlock.setStyle";
  id: string;
  style: ContentBlockStyle;
};
export const processingUpdateContentBlockSetStyleSchema = z.object({
  type: z.literal("contentBlock.setStyle"),
  id: z.string(),
  style: contentBlockStyleSchema,
});

/**
 * Represents the state of a tool call.
 *
 * @public
 */
export type ToolStatusStepStateStatus =
  | {
      type: "generatingToolCall";
      /**
       * The name of the tool to be called (if known).
       */
      name?: string;
      /**
       * The identifier of the plugin that provided the tool, if known + applicable.
       */
      pluginIdentifier?: string;
      /**
       * The string representation of the arguments (as being streamed).
       */
      argumentsString?: string;
    }
  | {
      type: "toolCallGenerationFailed";
      error: string;
      rawContent?: string;
    }
  | {
      type: "toolCallQueued";
    }
  | {
      type: "confirmingToolCall";
    }
  | {
      type: "toolCallDenied";
      denyReason?: string;
    }
  | {
      type: "callingTool";
    }
  | {
      type: "toolCallFailed";
      error: string;
    }
  | {
      type: "toolCallSucceeded";
      timeMs: number;
    };
export const toolStatusStepStateStatusSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("generatingToolCall"),
    name: z.string().optional(),
    pluginIdentifier: z.string().optional(),
    argumentsString: z.string().optional(),
  }),
  z.object({
    type: z.literal("toolCallGenerationFailed"),
    error: z.string(),
    rawContent: z.string().optional(),
  }),
  z.object({
    type: z.literal("toolCallQueued"),
  }),
  z.object({
    type: z.literal("confirmingToolCall"),
  }),
  z.object({
    type: z.literal("toolCallDenied"),
    denyReason: z.string().optional(),
  }),
  z.object({
    type: z.literal("callingTool"),
  }),
  z.object({
    type: z.literal("toolCallFailed"),
    error: z.string(),
  }),
  z.object({
    type: z.literal("toolCallSucceeded"),
    timeMs: z.number().int(),
  }),
]) as z.Schema<ToolStatusStepStateStatus>;

export type ToolStatusStepState = {
  status: ToolStatusStepStateStatus;
  customStatus: string;
  customWarnings: Array<string>;
};
export const toolStatusStepStateSchema = z.object({
  status: toolStatusStepStateStatusSchema,
  customStatus: z.string(),
  customWarnings: z.array(z.string()),
}) as z.Schema<ToolStatusStepState>;

export type ProcessingUpdateToolStatusCreate = {
  type: "toolStatus.create";
  id: string;
  callId: number;
  state: ToolStatusStepState;
};
export const processingUpdateToolStatusCreateSchema = z.object({
  type: z.literal("toolStatus.create"),
  id: z.string(),
  callId: z.number().int(),
  state: toolStatusStepStateSchema,
});

export type ProcessingUpdateToolStatusUpdate = {
  type: "toolStatus.update";
  id: string;
  state: ToolStatusStepState;
};
export const processingUpdateToolStatusUpdateSchema = z.object({
  type: z.literal("toolStatus.update"),
  id: z.string(),
  state: toolStatusStepStateSchema,
});

export type ProcessingUpdateToolStatusArgumentFragment = {
  type: "toolStatus.argumentFragment";
  id: string;
  content: string;
};
export const processingUpdateToolStatusArgumentFragmentSchema = z.object({
  type: z.literal("toolStatus.argumentFragment"),
  id: z.string(),
  content: z.string(),
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
  | ProcessingUpdateContentBlockAppendToolRequest
  | ProcessingUpdateContentBlockReplaceToolRequest
  | ProcessingUpdateContentBlockAppendToolResult
  | ProcessingUpdateContentBlockReplaceText
  | ProcessingUpdateContentBlockSetPrefix
  | ProcessingUpdateContentBlockSetSuffix
  | ProcessingUpdateContentBlockAttachGenInfo
  | ProcessingUpdateContentBlockSetStyle
  | ProcessingUpdateToolStatusCreate
  | ProcessingUpdateToolStatusUpdate
  | ProcessingUpdateToolStatusArgumentFragment
  | ProcessingUpdateSetSenderName;
export const processingUpdateSchema = z.discriminatedUnion("type", [
  processingUpdateStatusCreateSchema,
  processingUpdateStatusUpdateSchema,
  processingUpdateStatusRemoveSchema,
  processingUpdateCitationBlockCreateSchema,
  processingUpdateDebugInfoBlockCreateSchema,
  processingUpdateContentBlockCreateSchema,
  processingUpdateContentBlockAppendTextSchema,
  processingUpdateContentBlockAppendToolRequestSchema,
  processingUpdateContentBlockReplaceToolRequestSchema,
  processingUpdateContentBlockAppendToolResultSchema,
  processingUpdateContentBlockReplaceTextSchema,
  processingUpdateContentBlockSetPrefixSchema,
  processingUpdateContentBlockSetSuffixSchema,
  processingUpdateContentBlockAttachGenInfoSchema,
  processingUpdateContentBlockSetStyleSchema,
  processingUpdateToolStatusCreateSchema,
  processingUpdateToolStatusUpdateSchema,
  processingUpdateToolStatusArgumentFragmentSchema,
  processingUpdateSetSenderNameSchema,
]) as ZodSchema<ProcessingUpdate>;

export type ProcessingUpdateType = ProcessingUpdate["type"];
export type ProcessingUpdateOf<TType extends ProcessingUpdate["type"]> = Extract<
  ProcessingUpdate,
  { type: TType }
>;
