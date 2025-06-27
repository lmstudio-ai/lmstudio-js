import { type DocumentParsingLibraryIdentifier } from "@lmstudio/lms-shared-types";

/**
 * The result of parsing a document.
 *
 * @public
 * @deprecated [DEP-DOC-PARSE] Document parsing API is still in active development. Stay tuned for
 * updates.
 */
export interface ParseDocumentResult {
  /**
   * String representation of the parsed document.
   */
  content: string;
  /**
   * The parser used to parse the document.
   */
  parser: DocumentParsingLibraryIdentifier;
}
