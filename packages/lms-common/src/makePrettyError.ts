import { terminalSize } from "@lmstudio/lms-isomorphic";
import chalk from "chalk";
import process from "process";
import { changeErrorStackInPlace } from "./errorStack.js";

export function makeTitledPrettyError(title: string, content: string, stack?: string) {
  return makePrettyError(chalk.redBright(title) + "\n\n" + content, stack);
}
export function makePrettyError(content: string, stack?: string): Error {
  if ((process as any).browser || process.env.LMS_NO_FANCY_ERRORS || terminalSize().columns < 80) {
    const error = new Error(content);
    if (stack === undefined) {
      changeErrorStackInPlace(error, "");
    } else {
      changeErrorStackInPlace(error, stack);
    }
    return error;
  } else {
    if (stack !== undefined && process.env.LMS_CLI_DEBUG) {
      content += "\n\n" + chalk.white("</> STACK TRACE  ") + "\n" + chalk.gray(stack);
    }
    const error = new Error(content);
    Object.defineProperty(error, "lmstudioRawError", { value: content, enumerable: false });
    changeErrorStackInPlace(error, "");
    return error;
  }
}
