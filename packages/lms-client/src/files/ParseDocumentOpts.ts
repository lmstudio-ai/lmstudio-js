import {
  type DocumentParsingLibraryIdentifier,
  type DocumentParsingOpts,
  documentParsingOptsSchema,
} from "@lmstudio/lms-shared-types";
import { z } from "zod";

/**
 * Options for parsing a document.
 *
 * @public
 * @deprecated [DEP-DOC-PARSE] Document parsing API is still in active development. Stay tuned for
 * updates.
 */
export type ParseDocumentOpts = DocumentParsingOpts & {
  /**
   * A callback function that is called when the parser is identified and loaded.
   */
  onParserLoaded?: (parser: DocumentParsingLibraryIdentifier) => void;

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
