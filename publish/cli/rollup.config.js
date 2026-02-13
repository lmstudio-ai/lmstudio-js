import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import swc from "@rollup/plugin-swc";
import { builtinModules } from "node:module";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import banner from "rollup-plugin-banner2";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectoryPath = dirname(currentFilePath);
const lmsCliEntryPath = resolvePath(
  join(currentDirectoryPath, "..", "..", "packages", "lms-cli", "src", "index.ts")
);
const builtinModuleSpecifiers = new Set(
  builtinModules.map((moduleName) => {
    if (moduleName.startsWith("node:")) {
      return moduleName.slice("node:".length);
    }

    return moduleName;
  })
);

function normalizeBuiltinSpecifier(source) {
  let normalizedSource = source;
  while (normalizedSource.endsWith("/")) {
    normalizedSource = normalizedSource.slice(0, -1);
  }

  return normalizedSource;
}

function nodeBuiltinPrefixPlugin() {
  return {
    name: "node-builtin-prefix",
    resolveId(source) {
      if (typeof source !== "string") {
        return null;
      }

      if (source.startsWith("node:")) {
        return null;
      }

      if (source.startsWith("\0")) {
        return null;
      }

      if (
        source.startsWith(".") ||
        source.startsWith("/") ||
        source.startsWith("http://") ||
        source.startsWith("https://") ||
        source.startsWith("data:")
      ) {
        return null;
      }

      const normalizedSource = normalizeBuiltinSpecifier(source);
      if (normalizedSource.length === 0) {
        return null;
      }

      const sourceSegments = normalizedSource.split("/");
      const rootSpecifier = sourceSegments[0];

      if (
        builtinModuleSpecifiers.has(normalizedSource) ||
        builtinModuleSpecifiers.has(rootSpecifier)
      ) {
        return {
          id: `node:${normalizedSource}`,
          external: true,
        };
      }

      return null;
    },
  };
}

export default {
  input: lmsCliEntryPath,
  output: [
    {
      file: join(currentDirectoryPath, "dist", "index.js"),
      format: "es",
      inlineDynamicImports: true,
    },
  ],
  context: "globalThis",
  external: moduleId =>
    typeof moduleId === "string" && moduleId.startsWith("node:"),
  plugins: [
    nodeBuiltinPrefixPlugin(),
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
