import { type DocumentParsingOpts, documentParsingOptsSchema } from "@lmstudio/lms-shared-types";
import { z } from "zod";

export type ParseDocumentOpts = DocumentParsingOpts & {
  /**
   * A callback function that is called with the progress of the document parsing (0-1).
   */
  onProgress?: (progress: number) => void;
  /**
   * An optional AbortSignal that can be used to abort the document parsing.
   */
  signal?: AbortSignal;
};

export const parseDocumentOptsSchema = documentParsingOptsSchema.extend({
  onProgress: z.function().optional(),
  signal: z.instanceof(AbortSignal).optional(),
});
