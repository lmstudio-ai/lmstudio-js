import { z } from "zod";
import { type Chat } from "../../Chat.js";
import { type GeneratorController } from "./GeneratorController.js";

/**
 * TODO: Documentation
 *
 * @public
 */
export type Generator = (ctl: GeneratorController, history: Chat) => Promise<void>;
export const generatorSchema = z.function();
