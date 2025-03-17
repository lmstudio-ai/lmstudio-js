import { z } from "zod";
import { jsonSerializableSchema } from "../JSONSerializable.js";

/**
 * @public
 */
export type LLMStructuredPredictionType = "none" | "json" | "gbnf";
export const llmStructuredPredictionTypeSchema = z.enum(["none", "json", "gbnf"]);

/**
 * Settings for structured prediction. Structured prediction is a way to force the model to generate
 * predictions that conform to a specific structure.
 *
 * For example, you can use structured prediction to make the model only generate valid JSON, or
 * event JSON that conforms to a specific schema (i.e. having strict types).
 *
 * Some examples:
 *
 * Only generate valid JSON:
 *
 * ```ts
 * const prediction = model.complete("...", {
 *   maxTokens: 100,
 *   structured: { type: "json" },
 * });
 * ```
 *
 * Only generate JSON that conforms to a specific schema (See https://json-schema.org/ for more
 * information on authoring JSON schema):
 *
 * ```ts
 * const schema = {
 *   type: "object",
 *   properties: {
 *     name: { type: "string" },
 *     age: { type: "number" },
 *   },
 *   required: ["name", "age"],
 * };
 * const prediction = model.complete("...", {
 *   maxTokens: 100,
 *   structured: { type: "json", jsonSchema: schema },
 * });
 * ```
 *
 * By default, `{ type: "none" }` is used, which means no structured prediction is used.
 *
 * Caveats:
 *
 * - Although the model is forced to generate predictions that conform to the specified structure,
 *   the prediction may be interrupted (for example, if the user stops the prediction). When that
 *   happens, the partial result may not conform to the specified structure. Thus, always check the
 *   prediction result before using it, for example, by wrapping the `JSON.parse` inside a try-catch
 *   block.
 * - In certain cases, the model may get stuck. For example, when forcing it to generate valid JSON,
 *   it may generate a opening brace `{` but never generate a closing brace `}`. In such cases, the
 *   prediction will go on forever until the context length is reached, which can take a long time.
 *   Therefore, it is recommended to always set a `maxTokens` limit.
 *
 * @public
 */
export type LLMStructuredPredictionSetting = {
  type: LLMStructuredPredictionType;
  jsonSchema?: any;
  gbnfGrammar?: string;
};

export const llmStructuredPredictionSettingSchema = z.object({
  type: llmStructuredPredictionTypeSchema,
  jsonSchema: jsonSerializableSchema.optional(),
  gbnfGrammar: z.string().optional(),
});
