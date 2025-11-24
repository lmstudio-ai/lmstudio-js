#!/bin/bash
set -euo pipefail

DIST_DIR="./dist"
EXE_NAME="lms"
ENTRY_JS="../../packages/lms-cli/dist/index.js"
BUILD_DIR=".bun"

if ! command -v bun >/dev/null 2>&1; then
  echo "Error: bun is not installed or not in PATH" >&2
  exit 1
fi

if [ ! -f "${ENTRY_JS}" ]; then
  echo "Error: expected ESM entry at ${ENTRY_JS}. Run 'npm run build' first." >&2
  exit 1
fi

mkdir -p "${DIST_DIR}" "${BUILD_DIR}"

(
  cd "${BUILD_DIR}"
  bun build "../dist/index.js" --compile --outfile "../${DIST_DIR}/${EXE_NAME}"
)
chmod +x "${DIST_DIR}/${EXE_NAME}"
