// Inject the current version by replacing the magic string <LMS-CLI-CURRENT-VERSION>
// This is much faster than rollup-plugin-replace

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectoryPath = dirname(currentFilePath);

const content = readFileSync(join(currentDirectoryPath, "dist", "index.js"), "utf-8");
const packageJson = readFileSync(join(currentDirectoryPath, "package.json"), "utf-8");
let lmsKey = null;
try {
  lmsKey = readFileSync(join(currentDirectoryPath, "lms-key"), "utf-8").trim();
} catch (error) {
  console.error("Failed to read lms-key. Build in development mode.");
}

let replaced = content.replaceAll("<LMS-CLI-CURRENT-VERSION>", JSON.parse(packageJson).version);
if (lmsKey !== null) {
  replaced = replaced.replaceAll("<LMS-CLI-LMS-KEY>", lmsKey);
}

const nodeBuiltinModuleReplacements = [
  "assert",
  "buffer",
  "child_process",
  "console",
  "crypto",
  "events",
  "fs",
  "fs/promises",
  "http",
  "https",
  "module",
  "net",
  "os",
  "path",
  "process",
  "readline",
  "stream",
  "string_decoder",
  "tls",
  "tty",
  "readline/promises",
  "url",
  "util",
  "zlib",
];

for (const moduleName of nodeBuiltinModuleReplacements) {
  const from = `'${moduleName}'`;
  const to = `'node:${moduleName}'`;
  replaced = replaced.replaceAll(from, to);
}

writeFileSync(join(currentDirectoryPath, "dist", "index.js"), replaced, "utf-8");
