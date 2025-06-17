import { z } from "zod";

/**
 * Represents the library and version of a document parsing library.
 *
 * @public
 * @experimental Document parsing is still in development. Stay tuned for updates.
 */
export type DocumentParsingLibraryIdentifier = {
  /**
   * The identifier of the document parsing library.
   */
  library: string;
  /**
   * The version of the document parsing library.
   */
  version: string;
};

export const documentParsingLibraryIdentifierSchema = z.object({
  library: z.string(),
  version: z.string(),
});

/**
 * Options for parsing a document.
 *
 * @public
 * @deprecated Document parsing is still in development. Stay tuned for updates.
 */
export type DocumentParsingOpts = {
  /**
   * The parser backend to use for parsing the document. If not specified, the best available parser
   * will be used.
   */
  parserId?: DocumentParsingLibraryIdentifier;
};
export const documentParsingOptsSchema = z.object({
  parserId: documentParsingLibraryIdentifierSchema.optional(),
});
