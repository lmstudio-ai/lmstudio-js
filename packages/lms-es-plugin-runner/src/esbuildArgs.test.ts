import { createEsBuildArgs } from "./esbuildArgs.js";

test("Node plugin builds use ESM output", () => {
  const args = createEsBuildArgs({
    entryPath: "/tmp/plugin/.lmstudio/entry.ts",
    outPath: "/tmp/plugin/.lmstudio/production.js",
    production: true,
  });

  expect(args).toContain("--format=esm");
});
