import { z } from "zod";

/**
 * @deprecated
 * N.B.: onProgress returns progress as a float taking values from 0 to 1, 1 being completed
 */
export type DocumentParsingOpts = {
  /**
   * The parser backend to use for parsing the document. If not specified, the best available parser will be used.
   */
  parserId?: string;
};
export const documentParsingOptsSchema = z.object({
  parserId: z.string().optional(),
});
