import { z } from "zod";

/**
 * Controls how images are resized before being sent to the LLM.
 *
 * @experimental [EXP-IMAGE-RESIZE] Image resize settings are experimental and may change in the
 * future.
 * @public
 */
export interface ImageResizeSettings {
  maxWidth: number;
  maxHeight: number;
}
export const imageResizeSettingsSchema = z.object({
  maxWidth: z.number().int().positive(),
  maxHeight: z.number().int().positive(),
});
