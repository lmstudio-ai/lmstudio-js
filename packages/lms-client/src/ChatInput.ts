//packages/lms-client/src/ChatInput.ts
import {
  type ChatHistoryData,
  type ChatMessageData,
  type ChatMessageRoleData,
  chatMessageRoleDataSchema,
  type ChatMessagePartFileData,
  type ChatMessagePartTextData,
} from "@lmstudio/lms-shared-types";
import { z } from "zod";
import { FileHandle } from "./files/FileHandle";

/**
 * This type provides an easy way of specifying a single chat message.
 *
 * @public
 */
export interface ChatMessageInput {
  /**
   * The sender of this message. Only "user", "assistant", and "system" is allowed. Defaults to
   * "user" if not specified.
   */
  role?: ChatMessageRoleData;
  /**
   * Text content of the message.
   */
  content?: string;
  /**
   * Images to be sent with the message to be used with vision models. To get a FileHandle, use
   * `client.files.prepareImage`.
   */
  images?: Array<FileHandle>;
}
export const chatMessageInputSchema = z.object({
  role: chatMessageRoleDataSchema.optional(),
  content: z.string().optional(),
  images: z.array(z.instanceof(FileHandle)).optional(),
});

/**
 * This type provides an easy way of specifying a chat history.
 *
 * Example:
 *
 * ```ts
 * const chat = Chat.from([
 *   { role: "user", content: "Hello" },
 *   { role: "assistant", content: "Hi" },
 *   { role: "user", content: "How are you?" },
 * ]);
 * ```
 *
 * @public
 */
export type ChatInput = Array<ChatMessageInput>;
export const chatHistoryInputSchema = z.array(chatMessageInputSchema);

/**
 * Given a `ChatMessageInput` or `ChatMessageData`, returns true if the input is a
 * `ChatMessageInput`.
 */
export function isChatMessageInputAsOpposeToChatMessageData(
  chatMessageInput: ChatMessageInput | ChatMessageData,
): chatMessageInput is ChatMessageInput {
  return !Array.isArray(chatMessageInput.content);
}

export function isChatMessageInputAsOpposeToChatHistoryData(
  chatMessageInput: ChatMessageInput | ChatHistoryData,
): chatMessageInput is ChatMessageInput {
  return !("messages" in chatMessageInput);
}

export function chatMessageInputToChatMessageData(
  chatMessageInput: ChatMessageInput,
): ChatMessageData {
  const { role, content, images } = chatMessageInput;
  
  // Jeśli rola to "tool", zwróć specjalną strukturę
  if (role === "tool") {
    if (content === undefined) {
      throw new Error("Tool messages must have content");
    }
    // Tool messages wymagają toolCallResult parts
    return {
      role: "tool",
      content: [{
        type: "toolCallResult",
        content: content,
        // toolCallId i name są opcjonalne
      }],
    };
  }
  
  // Reszta kodu dla user/assistant/system bez zmian...
  const parts: Array<ChatMessagePartTextData | ChatMessagePartFileData> = [];
  if (images === undefined || images.length === 0) {
    if (content === undefined) {
      parts.push({
        type: "text",
        text: "",
      });
    }
  } else {
    for (const file of images) {
      parts.push({
        type: "file",
        identifier: file.identifier,
        name: file.name,
        fileType: file.type,
        sizeBytes: file.sizeBytes,
      });
    }
  }
  if (content !== undefined) {
    parts.push({
      type: "text",
      text: content,
    });
  }
  return {
    role: role ?? "user",
    content: parts,
  } as ChatMessageData;
}