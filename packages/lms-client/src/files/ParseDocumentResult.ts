import { type DocumentParsingLibraryIdentifier } from "@lmstudio/lms-shared-types";

/**
 * The result of parsing a document.
 *
 * @public
 * @experimental Document parsing is still in development. Stay tuned for updates.
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
