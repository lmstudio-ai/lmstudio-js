import { resolve } from "node:path";
import { resolveAbsolutePath } from "./index.js";
import { resolveAbsolutePath as resolveBrowserPath } from "./browser.js";

test.each([".", "../assets with spaces", resolve("assets")])(
  "Node resolves %s using the caller's CWD",
  path => {
    expect(resolveAbsolutePath(path)).toBe(resolve(path));
  },
);

test.each([".", "relative/assets", "C:relative", "\\rooted"])(
  "browser rejects a path requiring a process CWD: %s",
  path => {
    expect(() => resolveBrowserPath(path)).toThrow("absolute filesystem path");
  },
);

test.each(["/host/assets", "C:\\host\\assets", "C:/host/assets", "\\\\host\\share\\assets"])(
  "browser preserves an explicit absolute host path: %s",
  path => {
    expect(resolveBrowserPath(path)).toBe(path);
  },
);
