/** Browsers have no process CWD; only explicit absolute host paths can cross this boundary. */
export function resolveAbsolutePath(path: string): string {
  if (path.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith("\\\\")) {
    return path;
  }
  throw new Error(
    "An absolute filesystem path is required in environments without a working directory.",
  );
}
