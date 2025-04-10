import { type Tool } from "../../llm/tool";
import { type ToolsProviderController } from "./ToolsProviderController";

export type ToolsProvider = (ctl: ToolsProviderController) => Promise<Array<Tool>>;
