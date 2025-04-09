import { type Chat } from "../../Chat";

/**
 * WIP
 */
export type SimpleGenerator = (context: Chat, onFragment: () => void) => Promise<void>;
