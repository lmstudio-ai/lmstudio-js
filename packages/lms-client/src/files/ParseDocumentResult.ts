import { type DocumentParsingLibraryIdentifier } from "@lmstudio/lms-shared-types";

export interface ParseDocumentResult {
  content: string;
  parser: DocumentParsingLibraryIdentifier;
}
