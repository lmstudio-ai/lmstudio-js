#!/bin/bash
set -euo pipefail

BUN_VERSION="1.3.3"
BUN_TAG="bun-v${BUN_VERSION}"
DIST_DIR="./dist"
EXE_NAME="lms"
ENTRY_JS="./dist/index.js"

ARCH="$(uname -m)"

if [ ! -f "${ENTRY_JS}" ]; then
  echo "Error: expected ESM entry at ${ENTRY_JS}. Run 'npm run build' first." >&2
  exit 1
fi

if [ "${ARCH}" = "aarch64" ] || [ "${ARCH}" = "arm64" ]; then
  # Use Deno on linux arm64 (bun does not support 64k page sizes on linux arm)
  DENO_BINARY_PATH="${DIST_DIR}/deno"

  if [ ! -f "${DENO_BINARY_PATH}" ]; then
    bash ./download-deno-runtime.sh
  fi

  chmod +x "${DENO_BINARY_PATH}"
  "${DENO_BINARY_PATH}" compile --unstable-node-globals --allow-all --output "${DIST_DIR}/${EXE_NAME}" "${ENTRY_JS}"
elif [ "${ARCH}" = "x86_64" ]; then
  # TEMP: use Deno on x86_64 too
  DENO_BINARY_PATH="${DIST_DIR}/deno"

  if [ ! -f "${DENO_BINARY_PATH}" ]; then
    bash ./download-deno-runtime.sh
  fi

  chmod +x "${DENO_BINARY_PATH}"
  "${DENO_BINARY_PATH}" compile --unstable-node-globals --allow-all --output "${DIST_DIR}/${EXE_NAME}" "${ENTRY_JS}"
else
  echo "Unsupported architecture: ${ARCH}"
  exit 1
fi

chmod +x "${DIST_DIR}/${EXE_NAME}"
