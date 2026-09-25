import { resolveAbsolutePath as resolveBrowserPath } from "./browser.js";

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
