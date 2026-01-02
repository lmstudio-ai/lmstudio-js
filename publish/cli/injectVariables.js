// Inject commit hash by replacing the magic string <LMS-CLI-COMMIT-HASH>
// This is much faster than rollup-plugin-replace

import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectoryPath = dirname(currentFilePath);

const content = readFileSync(join(currentDirectoryPath, "dist", "index.js"), "utf-8");
let lmsKey = null;
try {
  lmsKey = readFileSync(join(currentDirectoryPath, "lms-key"), "utf-8").trim();
} catch (error) {
  console.error("Failed to read lms-key. Build in development mode.");
}

const lmsCliPath = join(currentDirectoryPath, "..", "..", "packages", "lms-cli");
let commitHash = "";
try {
  commitHash = execSync("git rev-parse --short HEAD", {
    cwd: lmsCliPath,
    encoding: "utf-8",
  }).trim();
} catch (error) {
  console.error("Failed to get commit hash from ../../packages/lms-cli submodule");
  throw error;
}

// Just a sanity check
if (commitHash.length === 0) {
  throw new Error("Commit hash is empty");
}

let replaced = content.replaceAll("<LMS-CLI-COMMIT-HASH>", commitHash);
if (lmsKey !== null) {
  replaced = replaced.replaceAll("<LMS-CLI-LMS-KEY>", lmsKey);
}

writeFileSync(join(currentDirectoryPath, "dist", "index.js"), replaced, "utf-8");
