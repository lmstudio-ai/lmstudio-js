import {
  getCurrentStack,
  type LoggerInterface,
  makePromise,
  safeCallCallback,
  SimpleLogger,
  text,
  type Validator,
} from "@lmstudio/lms-common";
import { type FilesPort } from "@lmstudio/lms-external-backend-interfaces";
import { readFileAsBase64 } from "@lmstudio/lms-isomorphic";
import { retrievalSchematics } from "@lmstudio/lms-kv-config";
import {
  type ChatMessagePartFileData,
  type DocumentParsingLibraryIdentifier,
  type KVConfig,
  type RetrievalFileProcessingStep,
} from "@lmstudio/lms-shared-types";
import { z } from "zod";
import { FileHandle } from "./FileHandle.js";
import { type ParseDocumentOpts, parseDocumentOptsSchema } from "./ParseDocumentOpts.js";
import { type ParseDocumentResult } from "./ParseDocumentResult.js";
import { type RetrievalOpts, retrievalOptsSchema } from "./RetrievalOpts.js";
import { type RetrievalResult, type RetrievalResultEntry } from "./RetrievalResult.js";

function getProcessingStepName(processingStep: RetrievalFileProcessingStep): string {
  switch (processingStep) {
    case "loading":
      return "Loading";
    case "chunking":
      return "Chunking";
    case "embedding":
      return "Embedding";
    default: {
      const exhaustiveCheck: never = processingStep;
      throw new Error(`Unexpected processing step: ${exhaustiveCheck}`);
    }
  }
}

/**
 * @public
 *
 * The namespace for file-related operations.
 */
export class FilesNamespace {
  /** @internal */
  private readonly logger: SimpleLogger;
  /** @internal */
  public constructor(
    /** @internal */
    private readonly filesPort: FilesPort,
    private readonly validator: Validator,
    parentLogger: LoggerInterface,
  ) {
    this.logger = new SimpleLogger("File", parentLogger);
  }

  /**
   * Gets the absolute path to a local file.
   *
   * @internal
   */
  public async getLocalFileAbsolutePath(fileName: string, stack?: string) {
    return await this.filesPort.callRpc("getLocalFileAbsolutePath", { fileName }, { stack });
  }

  /**
   * Creates a file handle from a chat message part file data. Used internally.
   *
   * @internal
   */
  public createFileHandleFromChatMessagePartFileData(data: ChatMessagePartFileData) {
    return new FileHandle(this, data.identifier, data.fileType, data.sizeBytes, data.name);
  }

  /**
   * Adds a temporary image to LM Studio, and returns a FileHandle that can be used to reference
   * this image. This image will be deleted when the client disconnects.
   *
   * This method can only be used in environments that have file system access (such as Node.js).
   */
  public async prepareImage(path: string): Promise<FileHandle> {
    const result = await readFileAsBase64(path);
    if (result.success === false) {
      throw new Error(text`
        Your current JavaScript environment does not support reading files. If you can read the file
        using other methods, please use "prepareImageBase64".
      `);
    }
    const fileName = path.split(/[\\/]/).at(-1)!;
    const { identifier, fileType, sizeBytes } = await this.filesPort.callRpc("uploadFileBase64", {
      name: fileName,
      contentBase64: result.base64,
    });
    return new FileHandle(this, identifier, fileType, sizeBytes, fileName);
  }

  /**
   * Adds a temporary image to LM Studio. The content of the file is specified using base64. If you
   * are using Node.js and have a file laying around, consider using `prepareImage` instead.
   */
  public async prepareImageBase64(fileName: string, contentBase64: string): Promise<FileHandle> {
    const { identifier, fileType, sizeBytes } = await this.filesPort.callRpc("uploadFileBase64", {
      name: fileName,
      contentBase64,
    });
    return new FileHandle(this, identifier, fileType, sizeBytes, fileName);
  }

  /**
   * Adds a temporary file to LM Studio, and returns a FileHandle that can be used to reference this
   * file. This file will be deleted when the client disconnects.
   *
   * This method can only be used in environments that have file system access (such as Node.js).
   *
   * @deprecated [DEP-RETRIEVAL] Retrieval API is still in active development. Stay tuned for
   * updates.
   */
  public async prepareFile(path: string): Promise<FileHandle> {
    // Currently, exactly the same as prepareImage.
    const result = await readFileAsBase64(path);
    if (result.success === false) {
      throw new Error(text`
        Your current JavaScript environment does not support reading files. If you can read the file
        using other methods, please use "prepareFileBase64".
      `);
    }
    const fileName = path.split(/[\\/]/).at(-1)!;
    const { identifier, fileType, sizeBytes } = await this.filesPort.callRpc("uploadFileBase64", {
      name: fileName,
      contentBase64: result.base64,
    });
    return new FileHandle(this, identifier, fileType, sizeBytes, fileName);
  }

  /**
   * Adds a temporary file to LM Studio. The content of the file is specified using base64. If you
   * are using Node.js and have a file laying around, consider using `prepareFile` instead.
   *
   * @deprecated [DEP-RETRIEVAL] Retrieval API is still in active development. Stay tuned for
   * updates.   */
  public async prepareFileBase64(fileName: string, contentBase64: string): Promise<FileHandle> {
    // Currently, exactly the same as prepareImageBase64.
    const { identifier, fileType, sizeBytes } = await this.filesPort.callRpc("uploadFileBase64", {
      name: fileName,
      contentBase64,
    });
    return new FileHandle(this, identifier, fileType, sizeBytes, fileName);
  }

  /**
   * @deprecated [DEP-RETRIEVAL] Retrieval API is still in active development. Stay tuned for
   * updates.   */
  public async retrieve(
    query: string,
    files: Array<FileHandle>,
    opts: RetrievalOpts = {},
  ): Promise<RetrievalResult> {
    const logger = this.logger;
    const stack = getCurrentStack(1);
    this.validator.validateMethodParamsOrThrow(
      "client.retrieval",
      "retrieve",
      ["query", "filePaths", "opts"],
      [z.string(), z.array(z.instanceof(FileHandle)), retrievalOptsSchema],
      [query, files, opts],
      stack,
    );
    const { verbose = "info" } = opts;
    const verboseLevel = typeof verbose === "boolean" ? "info" : verbose;
    const shouldLog =
      verbose &&
      opts.onFileProcessList === undefined &&
      opts.onFileProcessingStart === undefined &&
      opts.onFileProcessingEnd === undefined &&
      opts.onFileProcessingStepStart === undefined &&
      opts.onFileProcessingStepProgress === undefined &&
      opts.onFileProcessingStepEnd === undefined &&
      opts.onSearchingStart === undefined &&
      opts.onSearchingEnd === undefined;

    if (opts.embeddingModel === undefined) {
      throw new Error("Embedding model currently is required.");
    }

    const resolveFileIndex = (index: number) => {
      const file = files[index];
      if (file === undefined) {
        throw new Error(`File not found: ${index}`);
      }
      return file;
    };
    const resolveFileIndices = (indices: Array<number>) => {
      return indices.map(resolveFileIndex);
    };

    const kvConfig: KVConfig = retrievalSchematics.buildPartialConfig({
      chunkingMethod: opts.chunkingMethod,
      databaseFile: opts.databasePath,
      embeddingModel: (await opts.embeddingModel.getModelInfo())?.identifier,
      limit: opts.limit,
    });

    let filesToProcess: Array<FileHandle> | null;
    const filesProcessingStartTimes: Array<number> = [];
    let searchingStartTime = 0;
    let lastVerboseCallTime = 0;
    let lastVerboseLine = "";

    return await new Promise<RetrievalResult>((resolve, reject) => {
      const channel = this.filesPort.createChannel(
        "retrieve",
        { query, fileIdentifiers: files.map(file => file.identifier), config: kvConfig },
        message => {
          switch (message.type) {
            case "onFileProcessList":
              filesToProcess = resolveFileIndices(message.indices);
              safeCallCallback(logger, "onFileProcessList", opts.onFileProcessList, [
                filesToProcess,
              ]);
              if (shouldLog) {
                logger.logAtLevel(
                  verboseLevel,
                  text`
                    Found ${filesToProcess.length} files need processing:
                    ${filesToProcess.map(file => file.name).join(", ")}
                  `,
                );
              }
              break;
            case "onFileProcessingStart": {
              if (filesToProcess === null) {
                throw new Error("onFileProcessList must be called before onFileProcessingStart");
              }
              const file = resolveFileIndex(message.index);
              safeCallCallback(logger, "onFileProcessingStart", opts.onFileProcessingStart, [
                file,
                filesToProcess.indexOf(file),
                filesToProcess,
              ]);
              if (shouldLog) {
                filesProcessingStartTimes[message.index] = Date.now();
                logger.logAtLevel(
                  verboseLevel,
                  text`
                    Start processing file: ${file.name}
                    (${message.index + 1}/${filesToProcess.length})
                  `,
                );
              }
              break;
            }
            case "onFileProcessingEnd": {
              if (filesToProcess === null) {
                throw new Error("onFileProcessList must be called before onFileProcessingEnd");
              }
              const file = resolveFileIndex(message.index);
              safeCallCallback(logger, "onFileProcessingEnd", opts.onFileProcessingEnd, [
                file,
                filesToProcess.indexOf(file),
                filesToProcess,
              ]);
              if (shouldLog) {
                logger.logAtLevel(
                  verboseLevel,
                  text`
                    File processed: ${file.name}.
                    Time took: ${Date.now() - filesProcessingStartTimes[message.index]}ms
                  `,
                );
              }
              break;
            }
            case "onFileProcessingStepStart":
              safeCallCallback(
                logger,
                "onFileProcessingStepStart",
                opts.onFileProcessingStepStart,
                [resolveFileIndex(message.index), message.step],
              );
              break;
            case "onFileProcessingStepProgress": {
              safeCallCallback(
                logger,
                "onFileProcessingStepProgress",
                opts.onFileProcessingStepProgress,
                [resolveFileIndex(message.index), message.step, message.progress],
              );
              const now = Date.now();
              if (shouldLog && (now - lastVerboseCallTime > 500 || message.progress === 1)) {
                lastVerboseCallTime = now;
                const line = text`
                  > ${getProcessingStepName(message.step)}: ${Math.round(message.progress * 100)}%
                `;
                if (lastVerboseLine !== line) {
                  lastVerboseLine = line;
                  logger.logAtLevel(verboseLevel, line);
                }
              }
              break;
            }
            case "onFileProcessingStepEnd":
              safeCallCallback(logger, "onFileProcessingStepEnd", opts.onFileProcessingStepEnd, [
                resolveFileIndex(message.index),
                message.step,
              ]);
              break;
            case "onSearchingStart":
              safeCallCallback(logger, "onSearchingStart", opts.onSearchingStart, []);
              if (shouldLog) {
                searchingStartTime = Date.now();
                logger.logAtLevel(verboseLevel, "Start searching in the vector database...");
              }
              break;
            case "onSearchingEnd":
              safeCallCallback(logger, "onSearchingEnd", opts.onSearchingEnd, []);
              if (shouldLog) {
                logger.logAtLevel(
                  verboseLevel,
                  text`
                    Finished searching in the vector database.
                    Time took: ${Date.now() - searchingStartTime}ms
                  `,
                );
              }
              break;
            case "result": {
              resolve({
                entries: message.result.entries.map(
                  entry =>
                    ({
                      content: entry.content,
                      score: entry.score,
                      source: files[entry.sourceIndex],
                    }) satisfies RetrievalResultEntry,
                ),
              });
              break;
            }
          }
        },
      );
      if (opts.signal !== undefined) {
        if (opts.signal.aborted) {
          reject(opts.signal.reason);
          channel.send({ type: "stop" });
        } else {
          opts.signal?.addEventListener("abort", () => {
            reject(opts.signal!.reason);
            channel.send({ type: "stop" });
          });
        }
      }
      channel.onError.subscribeOnce(reject);
    });
  }

  /**
   * Parse a document
   *
   * @deprecated [DEP-DOC-PARSE] Document parsing API is still in active development. Stay tuned for
   * updates.
   */
  public async parseDocument(fileHandle: FileHandle, opts: ParseDocumentOpts = {}) {
    const stack = getCurrentStack(1);
    this.validator.validateMethodParamsOrThrow(
      "client.files",
      "parseDocument",
      ["fileHandle", "opts"],
      [z.instanceof(FileHandle), parseDocumentOptsSchema],
      [fileHandle, opts],
      stack,
    );

    const { onParserLoaded, onProgress, signal, ...config } = opts;
    const { promise, resolve, reject } = makePromise<ParseDocumentResult>();

    opts.signal?.throwIfAborted();

    let finished = false;
    const channel = this.filesPort.createChannel(
      "parseDocument",
      { fileIdentifier: fileHandle.identifier, parseOpts: config },
      message => {
        const messageType = message.type;
        switch (messageType) {
          case "progress": {
            safeCallCallback(this.logger, "onProgress", onProgress, [message.progress]);
            break;
          }
          case "parserLoaded": {
            safeCallCallback(this.logger, "onParserLoaded", onParserLoaded, [message.parser]);
            break;
          }
          case "result": {
            resolve({
              content: message.content,
              parser: message.parser,
            });
            finished = true;
            break;
          }
        }
      },
      { stack },
    );

    signal?.addEventListener("abort", () => {
      if (finished) {
        return;
      }
      reject(signal.reason);
      channel.send({ type: "cancel" });
    });

    channel.onError.subscribeOnce(reject);
    channel.onClose.subscribeOnce(() => {
      if (!finished) {
        reject(new Error("Channel closed before receiving a result."));
      }
    });
    return await promise;
  }

  /**
   * Get the parsing method for a document.
   *
   * @deprecated [DEP-DOC-PARSE] Document parsing API is still in active development. Stay tuned for
   * updates.
   */
  public async getDocumentParsingLibrary(
    fileHandle: FileHandle,
  ): Promise<DocumentParsingLibraryIdentifier> {
    const stack = getCurrentStack(1);
    return await this.filesPort.callRpc(
      "getDocumentParsingLibrary",
      { fileIdentifier: fileHandle.identifier },
      { stack },
    );
  }
}
