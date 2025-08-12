import { z } from "zod";

/**
 * Determine how to apply name transformations to tools.
 *
 * - `passThrough`: The tool name is used as-is, without any transformations. This is generally not
 *   recommended as the tool name can contain weird characters that may confuse the model.
 * - `removeSpecial`: The tool name is transformed to replace non-alphanumeric characters with
 *   underscores.
 * - `snakeCase`: The tool name is transformed to snake_case.
 * - `camelCase`: The tool name is transformed to camelCase.
 */
export type ToolNaming = "passThrough" | "removeSpecial" | "snakeCase" | "camelCase";
export const toolNamingSchema = z.enum(["passThrough", "removeSpecial", "snakeCase", "camelCase"]);
