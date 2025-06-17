import { type Tool } from "../../llm/tool";
import { type ToolsProviderController } from "./ToolsProviderController";

/**
 * Tools provider a function that when called, return a list of tools.
 *
 * @public
 */
export type ToolsProvider = (ctl: ToolsProviderController) => Promise<Array<Tool>>;
