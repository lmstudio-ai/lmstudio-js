import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import swc from "@rollup/plugin-swc";
import { builtinModules, createRequire } from "node:module";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import banner from "rollup-plugin-banner2";

const requireForConfig = createRequire(import.meta.url);
const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectoryPath = dirname(currentFilePath);

const builtinModuleNames = builtinModules.map((moduleName) =>
  moduleName.startsWith("node:") ? moduleName.slice("node:".length) : moduleName,
);
const builtinModuleNameSet = new Set(builtinModuleNames);

// Strip JSDoc comments containing import() types from bundled output. After Rollup inlines
// everything into a single file, relative import() paths in JSDoc become invalid and Deno's
// type checker will error on them during `deno compile`.
//
// Matches two forms:
//   1. Multi-line JSDoc lines:  ` * @typedef { import("./foo.js") } Foo`
//   2. Inline JSDoc comments:   `/** @type {typeof import('color-convert')} */`
const multiLineJsdocImportPattern =
  /^\s*\*\s*@\w+\s+\{[^\n}]*import\((?:'|")[^'"]+(?:'|")\)[^\n}]*\}[^\n]*\n/gm;
const inlineJsdocImportPattern =
  /\/\*\*\s*@\w+\s+\{[^}]*import\((?:'|")[^'"]+(?:'|")\)[^}]*\}\s*\*\//g;

function stripJsdocImportTypes(code) {
  return code.replace(multiLineJsdocImportPattern, "").replace(inlineJsdocImportPattern, "");
}

// Ensure bare Node.js built-in imports (e.g. "fs") are rewritten to "node:fs" so Deno can resolve them.
function getNodePrefixedBuiltin(moduleName) {
  if (moduleName.startsWith("node:")) {
    return moduleName;
  }

  if (builtinModuleNameSet.has(moduleName) === true) {
    return `node:${moduleName}`;
  }

  return null;
}

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
    {
      name: "node-builtin-prefixed",
      resolveId(source) {
        const nodeBuiltinId = getNodePrefixedBuiltin(source);
        if (nodeBuiltinId !== null) {
          return { id: nodeBuiltinId, external: true };
        }

        return null;
      },
    },
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
    {
      name: "strip-jsdoc-import-types",
      renderChunk(code) {
        const updatedCode = stripJsdocImportTypes(code);
        return { code: updatedCode, map: null };
      },
    },
    banner(() => "#!/usr/bin/env node\n"),
  ],
};
