import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import banner from "rollup-plugin-banner2";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import swc from "@rollup/plugin-swc";

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
  // Keep core runtime dependencies external so:
  // - Rollup still emits a single CLI entry that resolves these from node_modules at runtime.
  // - The rollup JS bundle stays small and does not inline react/ink.
  // - When we later run `bun build --compile`, Bun still sees `ws` as a normal import and can
  //   integrate it with its own HTTP/WebSocket implementation instead of a fully inlined shim.
  external: ["ink", "react", "react/jsx-runtime", "ws", /^node:/],
  plugins: [
    // Json should be before swc to handle imports correctly
    // or else swc might throw errors on json imports
    json(),
    // We use swc to transpile TypeScript and JSX
    // to JavaScript
    swc({
      jsc: {
        parser: {
          syntax: "typescript",
          tsx: true,
        },
        transform: {
          react: {
            runtime: "automatic",
          },
        },
      },
    }),
    nodeResolve({
      extensions: [".ts", ".tsx", ".js", ".jsx"],
    }),
    commonjs(),
    banner(() => "#!/usr/bin/env node\n"),
  ],
};
