import { z, type ZodSchema } from "zod";

/**
 * Represents a request to the user to confirm a tool call.
 */
export type ProcessingRequestConfirmToolCall = {
  type: "confirmToolCall";
  /**
   * The plugin that provided the tool.
   */
  pluginIdentifier?: string;
  /**
   * The name of the tool to call.
   */
  toolName: string;
  /**
   * The arguments to pass to the tool.
   */
  toolArgs: Record<string, any>;
};
export const processingRequestConfirmToolCallSchema = z.object({
  type: z.literal("confirmToolCall"),
  pluginIdentifier: z.string().optional(),
  toolName: z.string(),
  toolArgs: z.record(z.any()),
});

/**
 * @experimental WIP
 */
export type ProcessingRequestTextInput = {
  type: "textInput";
  prompt: string;
};
export const processingRequestTextInputSchema = z.object({
  type: z.literal("textInput"),
  prompt: z.string(),
});

export type ProcessingRequest = ProcessingRequestConfirmToolCall | ProcessingRequestTextInput;
export const processingRequestSchema = z.discriminatedUnion("type", [
  processingRequestConfirmToolCallSchema,
  processingRequestTextInputSchema,
]) as ZodSchema<ProcessingRequest>;

export type ProcessingRequestResponseConfirmToolCall = {
  type: "confirmToolCall";
  result:
    | {
        type: "allow";
        toolArgsOverride?: Record<string, any>;
      }
    | {
        type: "deny";
        denyReason?: string;
      };
};
export const processingRequestResponseConfirmToolCallSchema = z.object({
  type: z.literal("confirmToolCall"),
  result: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("allow"),
      toolArgsOverride: z.record(z.any()).optional(),
    }),
    z.object({
      type: z.literal("deny"),
      denyReason: z.string().optional(),
    }),
  ]),
});

/**
 * @experimental WIP
 */
export type ProcessingRequestResponseTextInput = {
  type: "textInput";
  result: string;
};
export const processingRequestResponseTextInputSchema = z.object({
  type: z.literal("textInput"),
  result: z.string(),
});

export type ProcessingRequestResponse =
  | ProcessingRequestResponseConfirmToolCall
  | ProcessingRequestResponseTextInput;
export const processingRequestResponseSchema = z.discriminatedUnion("type", [
  processingRequestResponseConfirmToolCallSchema,
  processingRequestResponseTextInputSchema,
]) as ZodSchema<ProcessingRequestResponse>;

export type ProcessingRequestType = ProcessingRequest["type"];
export type ProcessingRequestOf<TType extends ProcessingRequestType> = Extract<
  ProcessingRequest,
  { type: TType }
>;
export type ProcessingRequestResponseOf<TType extends ProcessingRequestType> = Extract<
  ProcessingRequestResponse,
  { type: TType }
>;
