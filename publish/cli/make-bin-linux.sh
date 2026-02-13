#!/bin/bash
set -euxo pipefail

DIST_DIR="./dist"
EXE_NAME="lms"
ENTRY_JS="./dist/index.js"
DENO_BINARY_PATH="${DIST_DIR}/deno"

if [ ! -f "${ENTRY_JS}" ]; then
  echo "Error: expected ESM entry at ${ENTRY_JS}. Run 'npm run build' first." >&2
  exit 1
fi

rm "${DIST_DIR}/${EXE_NAME}" 2> /dev/null || true

if [ ! -f "${DENO_BINARY_PATH}" ]; then
  bash ./download-deno-runtime.sh
fi

chmod +x "${DENO_BINARY_PATH}"
"${DENO_BINARY_PATH}" compile --allow-all --output "${DIST_DIR}/${EXE_NAME}" "${ENTRY_JS}"
chmod +x "${DIST_DIR}/${EXE_NAME}"
