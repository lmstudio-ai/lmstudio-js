import { z } from "zod";
import { modelDomainTypeSchema, type ModelDomainType } from "./ModelDomainType.js";
import { reasonableKeyStringSchema } from "./reasonable.js";

/**
 * Represents a query for a loaded LLM.
 *
 * @public
 */
export interface ModelQuery {
  /**
   * The domain of the model.
   */
  domain?: ModelDomainType;
  /**
   * If provided, restricts query matching to a specific device.
   *
   * Use null to restrict to local-only.
   */
  deviceIdentifier?: string | null;
  /**
   * If specified, the model must have exactly this identifier.
   *
   * Note: The identifier of a model is set when loading the model. It defaults to the filename of
   * the model if not specified. However, this default behavior should not be relied upon. If you
   * wish to query a model by its path, you should specify the path instead of the identifier:
   *
   * Instead of
   *
   * ```ts
   * const model = client.llm.get({ identifier: "lmstudio-community/Meta-Llama-3-8B-Instruct-GGUF" });
   * // OR
   * const model = client.llm.get("lmstudio-community/Meta-Llama-3-8B-Instruct-GGUF");
   * ```
   *
   * Use
   *
   * ```ts
   * const model = client.llm.get({ path: "lmstudio-community/Meta-Llama-3-8B-Instruct-GGUF" });
   * ```
   */
  identifier?: string;
  /**
   * If specified, the model must have this path.
   *
   * When specifying the model path, you can use the following format:
   *
   * `<publisher>/<repo>[/model_file]`
   *
   * If `model_file` is not specified, any quantization of the model will match this query.
   *
   * Here are some examples:
   *
   * Query any loaded Llama 3 model:
   *
   * ```ts
   * const model = client.llm.get({
   *   path: "lmstudio-community/Meta-Llama-3-8B-Instruct-GGUF",
   * });
   * ```
   *
   * Query any loaded model with a specific quantization of the Llama 3 model:
   *
   * ```ts
   * const model = client.llm.get({
   *   path: "lmstudio-community/Meta-Llama-3-8B-Instruct-GGUF/Meta-Llama-3-8B-Instruct-Q4_K_M.gguf",
   * });
   * ```
   */
  path?: string;
  /**
   * If true, the model must have vision capabilities. If false, the model must not have vision
   * capabilities.
   */
  vision?: boolean;
}
export const modelQuerySchema = z.object({
  domain: modelDomainTypeSchema.optional(),
  deviceIdentifier: z.string().nullable().optional(),
  identifier: reasonableKeyStringSchema.optional(),
  path: reasonableKeyStringSchema.optional(),
  vision: z.boolean().optional(),
});

export const modelSpecifierSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("query"),
    query: modelQuerySchema,
  }),
  z.object({
    type: z.literal("instanceReference"),
    instanceReference: z.string(),
  }),
]);
export type ModelSpecifier = z.infer<typeof modelSpecifierSchema>;
