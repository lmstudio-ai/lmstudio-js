#!/bin/bash
set -euo pipefail

DIST_DIR="./dist"
ENTRY_JS="../../packages/lms-cli/dist/index.js"
OUTPUT_EXE="${DIST_DIR}/lms-bun"

if ! command -v bun >/dev/null 2>&1; then
  echo "Error: bun is not installed or not in PATH" >&2
  exit 1
fi

if [ ! -f "${ENTRY_JS}" ]; then
  echo "Error: expected ESM entry at ${ENTRY_JS}. Build @lmstudio/lms-cli first." >&2
  exit 1
fi

mkdir -p "${DIST_DIR}"

bun build "${ENTRY_JS}" --compile --outfile "${OUTPUT_EXE}"
chmod +x "${OUTPUT_EXE}"
