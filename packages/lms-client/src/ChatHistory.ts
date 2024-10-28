import { accessMaybeMutableInternals, MaybeMutable, text } from "@lmstudio/lms-common";
import {
  type ChatHistoryData,
  chatHistoryDataSchema,
  type ChatMessageData,
  chatMessageDataSchema,
  type ChatMessagePartFileData,
  type ChatMessagePartTextData,
  type ChatMessageRoleData,
  type LLMConversationContextInput,
  llmConversationContextInputSchema,
} from "@lmstudio/lms-shared-types";
import { z } from "zod";
import { type LMStudioClient } from "./LMStudioClient";
import { FileHandle } from "./files/FileHandle";

/**
 * Represents a chat history.
 *
 * @public
 */
export class ChatHistory extends MaybeMutable<ChatHistoryData> {
  protected override getClassName(): string {
    return "ChatHistory";
  }
  protected override create(data: ChatHistoryData, mutable: boolean): this {
    return new ChatHistory(data, mutable) as this;
  }
  protected override cloneData(data: ChatHistoryData): ChatHistoryData {
    return chatHistoryDataSchema.parse(data); // Using zod to clone the data
  }
  /**
   * Don't use this constructor directly.
   *
   * - To create an empty chat history, use `ChatHistory.createEmpty()`.
   * - To create a chat history with existing data, use `ChatHistory.from()`.
   */
  protected constructor(data: ChatHistoryData, mutable: boolean) {
    super(data, mutable);
  }

  /**
   * Creates an empty mutable chat history.
   */
  public static createEmpty() {
    return new ChatHistory({ messages: [] }, true);
  }

  /**
   * Quickly create a mutable chat history with something that can be converted to a chat history.
   *
   * The created chat history will be a mutable copy of the input.
   *
   * @example
   * ```ts
   * const history = ChatHistory.from([
   *   { role: "user", content: "Hello" },
   *   { role: "assistant", content: "Hi!" },
   *   { role: "user", content: "What is your name?" },
   * ]);
   * ```
   */
  public static from(initializer: ChatHistoryLike) {
    if (initializer instanceof ChatHistory) {
      // ChatHistory
      return initializer.asMutableCopy();
    }
    if (!Array.isArray(initializer)) {
      // ChatHistoryData
      return new ChatHistory(initializer, false).asMutableCopy();
    }
    // LLMConversationContextInput
    return new ChatHistory(
      chatHistoryDataSchema.parse({
        messages: initializer.map(({ role, content }) => ({
          role,
          content: [{ type: "text", text: content }],
        })),
      }),
      true,
    );
  }

  /**
   * Creates a chat history with raw data. This method is intended for internal use only.
   *
   * If mutable is set to false, you MUST ensure that the data is not mutated.
   *
   * @internal
   */
  public static createRaw(data: ChatHistoryData, mutable: boolean) {
    return new ChatHistory(data, mutable);
  }

  /**
   * Gets the raw data of this message. This method is intended for internal use only.
   *
   * If mutable is set to false, you MUST ensure that the data is not mutated.
   *
   * @internal
   */
  public getRaw() {
    return this.data;
  }

  /**
   * Append a text message to the history.
   */
  public append(role: ChatMessageRoleData, content: string): void;
  /**
   * Append a message to the history.
   */
  public append(message: ChatMessage): void;
  public append(...args: [role: ChatMessageRoleData, content: string] | [message: ChatMessage]) {
    this.guardMutable();
    if (args.length === 1) {
      const [message] = args;
      const messageMutable = accessMaybeMutableInternals(message)._internalToMutable();
      this.data.messages.push(accessMaybeMutableInternals(messageMutable)._internalGetData());
    } else {
      const [role, content] = args;
      if (role === "user" || role === "system" || role === "assistant") {
        this.data.messages.push({
          role,
          content: [{ type: "text", text: content }],
        });
      } else {
        throw new Error(text`
          Unsupported role for append() API with [role, content] parameters: ${role}.
          Supported roles are 'user', 'system', and 'assistant'.
        `);
      }
    }
  }

  /**
   * Make a copy of this history and append a text message to the copy. Return the copy.
   */
  public withAppended(role: ChatMessageRoleData, content: string): ChatHistory;
  /**
   * Make a copy of this history and append a message to the copy. Return the copy.
   */
  public withAppended(message: ChatMessage): ChatHistory;
  public withAppended(
    ...args: [role: ChatMessageRoleData, content: string] | [message: ChatMessage]
  ): ChatHistory {
    const copy = this.asMutableCopy();
    (copy.append as any)(...args);
    return copy;
  }

  /**
   * Get the number of messages in the history.
   */
  public getLength() {
    return this.data.messages.length;
  }

  /**
   * Get the number of messages in the history.
   */
  public get length() {
    return this.getLength();
  }

  /**
   * Remove the last message from the history. If the history is empty, this method will throw.
   */
  public pop(): ChatMessage {
    this.guardMutable();
    if (this.data.messages.length === 0) {
      throw new Error("Tried to pop from an empty history.");
    }
    const popped = this.data.messages.pop()!;
    return ChatMessage.createRaw(popped, true);
  }

  /**
   * Gets all files contained in this history.
   *
   * @param client - LMStudio client
   */
  public getAllFiles(client: LMStudioClient): Array<FileHandle> {
    return this.data.messages
      .flatMap(
        message =>
          message.content.filter(part => part.type === "file") as Array<ChatMessagePartFileData>,
      )
      .map(
        part =>
          new FileHandle(client.files, part.identifier, part.fileType, part.sizeBytes, part.name),
      );
  }

  /**
   * Allows iterating over the files in the history.
   */
  public *files(client: LMStudioClient): Generator<FileHandle> {
    for (const message of this.data.messages) {
      for (const part of message.content) {
        if (part.type === "file") {
          yield new FileHandle(
            client.files,
            part.identifier,
            part.fileType,
            part.sizeBytes,
            part.name,
          );
        }
      }
    }
  }

  /**
   * Returns true if this history contains any files.
   */
  public hasFiles() {
    return this.data.messages.some(message => message.content.some(part => part.type === "file"));
  }

  /**
   * Gets the message at the given index. If the index is negative, it will be counted from the end.
   *
   * If the index is out of bounds, this method will throw as oppose to returning undefined. This is
   * to help catch bugs early.
   */
  public at(index: number) {
    let actualIndex = index;
    if (index < 0) {
      actualIndex = this.data.messages.length + index;
    }
    if (actualIndex < 0 || actualIndex >= this.data.messages.length) {
      throw new Error(text`
        Tried to access the message at index ${index}, but the history only has
        ${this.data.messages.length} messages.
      `);
    }
    return ChatMessage.createRaw(this.data.messages[actualIndex], this.mutable);
  }

  /**
   * Allows iterating over the messages in the history.
   */
  public *[Symbol.iterator](): Generator<ChatMessage> {
    for (const message of this.data.messages) {
      yield ChatMessage.createRaw(message, this.mutable);
    }
  }

  /**
   * Given a predicate, the predicate is called for each file in the history.
   *
   * - If the predicate returns true, the file is removed from the history and is collected into the
   *   returned array.
   * - If the predicate returns false, the file is kept in the history.
   *
   * This method is useful if you are implementing a preprocessor that needs to convert certain
   * types of files.
   *
   * If the predicate needs to be async, use the {@link ChatHistory#consumeFilesAsync} method.
   *
   * @param client - LMStudio client
   * @param predicate - The predicate to call for each file.
   * @returns The files that were consumed.
   */
  public consumeFiles(client: LMStudioClient, predicate: (file: FileHandle) => boolean) {
    this.guardMutable();
    const consumedFiles: Array<FileHandle> = [];
    for (const message of this.data.messages) {
      consumedFiles.push(...ChatMessage.createRaw(message, true).consumeFiles(client, predicate));
    }
    return consumedFiles;
  }

  /**
   * Given an async predicate, the predicate is called for each file in the history.
   *
   * - If the predicate returns true, the file is removed from the history and is collected into the
   *  returned array.
   * - If the predicate returns false, the file is kept in the history.
   *
   * This method is useful if you are implementing a preprocessor that needs to convert certain
   * types of files.
   *
   * If you need a synchronous version, use the {@link ChatHistory#consumeFiles} method.
   *
   * @param client - LMStudio client
   * @param predicate - The predicate to call for each file.
   * @returns The files that were consumed.
   */
  public async consumeFilesAsync(
    client: LMStudioClient,
    predicate: (file: FileHandle) => Promise<boolean>,
  ) {
    this.guardMutable();
    const consumedFiles: Array<FileHandle> = [];
    for (const message of this.data.messages) {
      consumedFiles.push(
        ...(await ChatMessage.createRaw(message, true).consumeFilesAsync(client, predicate)),
      );
    }
    return consumedFiles;
  }

  public getSystemPrompt() {
    return this.data.messages
      .filter(message => message.role === "system")
      .map(message =>
        message.content
          .filter(part => part.type === "text")
          .map(part => (part as ChatMessagePartTextData).text)
          .join(" "),
      )
      .join("\n\n");
  }

  public replaceSystemPrompt(content: string) {
    this.guardMutable();
    this.data.messages = this.data.messages.filter(message => message.role !== "system");
    this.data.messages.unshift({ role: "system", content: [{ type: "text", text: content }] });
  }

  public filterInPlace(predicate: (message: ChatMessage) => boolean) {
    this.guardMutable();
    this.data.messages = this.data.messages.filter(message =>
      predicate(ChatMessage.createRaw(message, true)),
    );
  }

  public override toString() {
    return (
      "ChatHistory {\n" +
      this.data.messages
        .map(message => "  " + ChatMessage.createRaw(message, false).toString())
        .join("\n") +
      "\n}"
    );
  }
}

/**
 * Represents anything that can be converted to a ChatHistory.
 *
 * @public
 */
export type ChatHistoryLike = ChatHistory | ChatHistoryData | LLMConversationContextInput;
export const chatHistoryLikeSchema = z.union([
  z.instanceof(ChatHistory as any),
  chatHistoryDataSchema,
  llmConversationContextInputSchema,
]) as z.ZodUnion<
  [z.ZodType<ChatHistory>, z.ZodType<ChatHistoryData>, z.ZodType<LLMConversationContextInput>]
>;

/**
 * Represents a single message in the history.
 *
 * @public
 */
export class ChatMessage extends MaybeMutable<ChatMessageData> {
  protected override getClassName(): string {
    return "ChatMessage";
  }
  protected override create(data: ChatMessageData, mutable: boolean): this {
    return new ChatMessage(data, mutable) as this;
  }
  protected override cloneData(data: ChatMessageData): ChatMessageData {
    return chatMessageDataSchema.parse(data); // Using zod to clone the data
  }
  protected constructor(data: ChatMessageData, mutable: boolean) {
    super(data, mutable);
  }

  /**
   * Create a mutable text only message.
   */
  public static create(role: ChatMessageRoleData, content: string) {
    return new ChatMessage(
      chatMessageDataSchema.parse({
        role,
        content: [{ type: "text", text: content }],
      }),
      true,
    );
  }

  /**
   * Creates a chat history with raw data. This method is intended for internal use only.
   *
   * If mutable is set to false, you MUST ensure that the data is not mutated.
   *
   * @internal
   */
  public static createRaw(data: ChatMessageData, mutable: boolean) {
    return new ChatMessage(data, mutable);
  }

  /**
   * Gets the raw data of this message. This method is intended for internal use only.
   *
   * If mutable is set to false, you MUST ensure that the data is not mutated.
   *
   * @internal
   */
  public getRaw() {
    return this.data;
  }

  public getRole() {
    return this.data.role;
  }

  public setRole(role: ChatMessageRoleData) {
    this.guardMutable();
    this.data.role = role;
  }

  private getFileParts(): Array<ChatMessagePartFileData> {
    return this.data.content.filter(part => part.type === "file") as Array<ChatMessagePartFileData>;
  }

  /**
   * Gets all text contained in this message.
   */
  public getText() {
    return this.data.content
      .filter(part => part.type === "text")
      .map(part => (part as ChatMessagePartTextData).text)
      .join(" ");
  }

  /**
   * Gets all files contained in this message.
   *
   * @param client - LMStudio client
   */
  public getFiles(client: LMStudioClient) {
    return this.getFileParts().map(
      part =>
        new FileHandle(client.files, part.identifier, part.fileType, part.sizeBytes, part.name),
    );
  }

  /**
   * Allows iterating over the files in the message.
   */
  public *files(client: LMStudioClient): Generator<FileHandle> {
    for (const part of this.getFileParts()) {
      yield new FileHandle(client.files, part.identifier, part.fileType, part.sizeBytes, part.name);
    }
  }

  /**
   * Given a predicate, the predicate is called for each file in the message.
   *
   * - If the predicate returns true, the file is removed from the message and is collected into the
   *   returned array.
   * - If the predicate returns false, the file is kept in the message.
   *
   * This method is useful if you are implementing a preprocessor that needs to convert certain
   * types of files.
   *
   * If the predicate needs to be async, use the {@link ChatMessage#consumeFilesAsync} method.
   *
   * @param client - LMStudio client
   * @param predicate - The predicate to call for each file.
   * @returns The files that were consumed.
   */
  public consumeFiles(client: LMStudioClient, predicate: (file: FileHandle) => boolean) {
    this.guardMutable();
    const consumedFiles: Array<FileHandle> = [];
    const partIndexesToRemove = new Set<number>();
    for (const [index, part] of this.data.content.entries()) {
      if (part.type !== "file") {
        continue;
      }
      const file = new FileHandle(
        client.files,
        part.identifier,
        part.fileType,
        part.sizeBytes,
        part.name,
      );
      if (predicate(file)) {
        consumedFiles.push(file);
        partIndexesToRemove.add(index);
      }
    }
    this.data.content = this.data.content.filter(
      (_, index) => !partIndexesToRemove.has(index),
    ) as typeof this.data.content;
    return consumedFiles;
  }

  /**
   * Given an async predicate, the predicate is called for each file in the message.
   *
   * - If the predicate returns true, the file is removed from the message and is collected into the
   *  returned array.
   * - If the predicate returns false, the file is kept in the message.
   *
   * This method is useful if you are implementing a preprocessor that needs to convert certain
   * types of files.
   *
   * If you need a synchronous version, use the {@link ChatMessage#consumeFiles} method.
   *
   * @param client - LMStudio client
   * @param predicate - The predicate to call for each file.
   * @returns The files that were consumed.
   */
  public async consumeFilesAsync(
    client: LMStudioClient,
    predicate: (file: FileHandle) => Promise<boolean>,
  ) {
    this.guardMutable();
    const consumedFiles: Array<FileHandle> = [];
    const partIndexesToRemove = new Set<number>();
    for (const [index, part] of this.data.content.entries()) {
      if (part.type !== "file") {
        continue;
      }
      const file = new FileHandle(
        client.files,
        part.identifier,
        part.fileType,
        part.sizeBytes,
        part.name,
      );
      if (await predicate(file)) {
        consumedFiles.push(file);
        partIndexesToRemove.add(index);
      }
    }
    this.data.content = this.data.content.filter(
      (_, index) => !partIndexesToRemove.has(index),
    ) as typeof this.data.content;
    return consumedFiles;
  }

  /**
   * Returns true if this message contains any files.
   */
  public hasFiles(): boolean {
    return this.data.content.some(part => part.type === "file");
  }

  /**
   * Append text to the message.
   */
  public appendText(text: string) {
    this.guardMutable();
    switch (this.data.role) {
      case "assistant":
      case "user":
      case "system":
        this.data.content.push({
          type: "text",
          text,
        });
        break;
      case "tool":
        throw new Error(`Cannot append text to a message with role "${this.data.role}"`);
      default: {
        const exhaustiveCheck: never = this.data;
        throw new Error(`Unhandled role in switch statement: ${(exhaustiveCheck as any).role}`);
      }
    }
  }

  /**
   * Replaces all text in the messages.
   *
   * If the message contains other components (such as files), they will kept. The replaced text
   * will be inserted to the beginning of the message.
   */
  public replaceText(text: string) {
    this.guardMutable();
    switch (this.data.role) {
      case "assistant":
      case "user":
      case "system":
        this.data.content = [
          { type: "text", text },
          ...this.data.content.filter(part => part.type !== "text"),
        ];
        break;
      case "tool":
        throw new Error(`Cannot replace text in a message with role "${this.data.role}"`);
      default: {
        const exhaustiveCheck: never = this.data;
        throw new Error(`Unhandled role in switch statement: ${(exhaustiveCheck as any).role}`);
      }
    }
  }

  public isSystemPrompt() {
    return this.data.role === "system";
  }

  public isUserMessage() {
    return this.data.role === "user";
  }

  public isAssistantMessage() {
    return this.data.role === "assistant";
  }

  public override toString() {
    return (
      this.data.role +
      ": " +
      this.data.content
        .map(part => {
          switch (part.type) {
            case "text":
              return part.text;
            case "file":
              return "<file>";
            case "toolCallRequest":
              return JSON.stringify(part.toolCallRequests, null, 2);
            case "toolCallResult":
              return part.content;
            default: {
              const exhaustiveCheck: never = part;
              throw new Error(`Unknown part type: ${(exhaustiveCheck as any).type}`);
            }
          }
        })
        .join(" ")
    );
  }
}
