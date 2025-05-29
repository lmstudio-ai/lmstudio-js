import { z } from "zod";

/**
 * @deprecated
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
