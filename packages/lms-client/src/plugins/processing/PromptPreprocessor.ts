import { z } from "zod";
import { type ChatMessage } from "../../Chat.js";
import { type PromptPreprocessorController } from "./ProcessingController.js";

/**
 * TODO: Documentation
 *
 * @public
 */
export type PromptPreprocessor = (
  ctl: PromptPreprocessorController,
  userMessage: ChatMessage,
) => Promise<string | ChatMessage>;
export const promptPreprocessorSchema = z.function();
