import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import banner from "rollup-plugin-banner2";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const requireForConfig = createRequire(import.meta.url);
const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectoryPath = dirname(currentFilePath);

export default {
  input: resolvePath(requireForConfig.resolve("@lmstudio/lms-cli")),
  output: [
    {
      file: join(currentDirectoryPath, "dist", "index.js"),
      format: "es",
      inlineDynamicImports: true,
    },
  ],
  context: "globalThis",
  plugins: [
    nodeResolve({
      extensions: [".ts", ".tsx", ".js", ".jsx"],
    }),
    commonjs(),
    json(),
    banner(() => "#!/usr/bin/env node\n"),
  ],
};
