import { parseFileIdentifier } from "@lmstudio/lms-common";
import { type FileType, type ParsedFileIdentifier } from "@lmstudio/lms-shared-types";
import { type FilesNamespace } from "./FilesNamespace.js";

/**
 * Represents a file. Currently, the file can be either in the local file system or base64 encoded.
 *
 * @public
 */
export class FileHandle {
  /**
   * @deprecated Direct construction is not recommended. Please use the `prepareFile` API instead
   */
  public constructor(
    public readonly filesNamespace: FilesNamespace,
    public readonly identifier: string,
    public readonly type: FileType,
    public readonly sizeBytes: number,
    /**
     * Original file name
     */
    public readonly name: string,
  ) {
    this.parsedIdentifier = parseFileIdentifier(identifier);
  }
  private readonly parsedIdentifier: ParsedFileIdentifier;

  /**
   * Gets the absolute file path of this file.
   */
  public async getFilePath() {
    switch (this.parsedIdentifier.type) {
      case "local": {
        return (await this.filesNamespace.getLocalFileAbsolutePath(this.parsedIdentifier.fileName))
          .path;
      }
      case "base64": {
        throw new Error(
          "Not implemented. Please open an issue on GitHub if you encountered this error.",
        );
      }
      default: {
        const _exhaustiveCheck: never = this.parsedIdentifier;
        throw new Error(`Unexpected file identifier type: ${JSON.stringify(_exhaustiveCheck)}`);
      }
    }
  }

  public isImage() {
    return this.type === "image";
  }
}
