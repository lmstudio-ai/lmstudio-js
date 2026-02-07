import process from "process";

// Error stack manipulation related functions

export function getCurrentStack(goAbove = 0) {
  const stack = new Error().stack;
  if (!stack) {
    return "";
  }
  const lines = stack.split("\n");
  return lines.slice(2 + goAbove).join("\n");
}

export function changeErrorStackInPlace(error: Error | null | undefined, newStack: string) {
  if (error === null || error === undefined) {
    return;
  }
  if (process.env.LMS_KEEP_INTERNAL_STACK) {
    return;
  }
  const stackContent = error.stack ?? "";
  error.stack = (
    stackContent.substring(0, stackContent.indexOf("\n    at ")).trimEnd() +
    "\n" +
    newStack
  ).trimEnd();
}
