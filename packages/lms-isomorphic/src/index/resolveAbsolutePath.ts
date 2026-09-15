import { resolve } from "node:path";

/** Resolve a caller-supplied filesystem path before crossing the client/server boundary. */
export function resolveAbsolutePath(path: string): string {
  return resolve(path);
}
