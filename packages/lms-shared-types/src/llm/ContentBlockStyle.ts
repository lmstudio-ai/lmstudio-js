import { z } from "zod";
import { colorPaletteSchema, type ColorPalette } from "../ColorPalette.js";

export interface ContentBlockStyleBase {
  forceRenderAsPlainText?: boolean;
}

const contentBlockStyleBaseSchema = z.object({
  forceRenderAsPlainText: z.boolean().default(false),
});

/**
 * The style of a content block.
 *
 * @public
 */
export type ContentBlockStyle =
  | ({
      type: "default";
    } & ContentBlockStyleBase)
  | ({
      type: "customLabel";
      label: string;
      color?: ColorPalette;
    } & ContentBlockStyleBase)
  | ({
      type: "thinking";
      ended?: boolean;
      title?: string;
    } & ContentBlockStyleBase);
export const contentBlockStyleSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("default"),
    })
    .merge(contentBlockStyleBaseSchema),
  z
    .object({
      type: z.literal("customLabel"),
      label: z.string(),
      color: z.optional(colorPaletteSchema),
    })
    .merge(contentBlockStyleBaseSchema),
  z
    .object({
      type: z.literal("thinking"),
      ended: z.boolean().optional(),
      title: z.string().optional(),
    })
    .merge(contentBlockStyleBaseSchema),
]) as z.Schema<ContentBlockStyle>;
