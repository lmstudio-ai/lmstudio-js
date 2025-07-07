import { z } from "zod";
import { jsonSerializableSchema } from "../JSONSerializable.js";

/**
 * TODO: Documentation
 *
 * @public
 */
export type LLMToolParameters = {
  type: "object";
  properties: Record<string, any>;
  required?: string[];
  additionalProperties?: boolean;
  $defs?: Record<string, any>;
};

export const llmToolParametersSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("object"),
    properties: z.record(jsonSerializableSchema),
    required: z.array(z.string()).optional(),
    additionalProperties: z.boolean().optional(),
    $defs: z.record(jsonSerializableSchema).optional(),
  }),
  // add more parameter types here
  // ...
]);

/**
 * TODO: Documentation
 *
 * @public
 */
export type LLMTool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: LLMToolParameters;
  };
  // add more tool types here
  // ...
};

export const llmToolSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("function"),
    function: z.object({
      name: z.string(),
      description: z.string().optional(),
      parameters: llmToolParametersSchema.optional(),
    }),
  }),
  // add more tool types here
  // ...
]);

/**
 * For convenience
 */
export const llmToolArraySchema = z.array(llmToolSchema);

/**
 * TODO: Documentation
 *
 * @public
 */
export type LLMToolUseSetting =
  | {
      type: "none";
    }
  | {
      type: "toolArray";
      tools?: LLMTool[];
      force?: boolean;
    };

export const llmToolUseSettingSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("none"),
  }),
  z.object({
    type: z.literal("toolArray"),
    tools: z.array(llmToolSchema).optional(),
    force: z.boolean().optional(),
  }),
]);
