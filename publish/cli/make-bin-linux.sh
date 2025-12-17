#!/bin/bash
set -euo pipefail

BUN_VERSION="bun-v1.3.3"
DIST_DIR="./dist"
EXE_NAME="lms"
ENTRY_JS="./dist/index.js"

LOCAL_BUN_DIR="./local-bun"
if ! command -v bun >/dev/null 2>&1; then
  echo "bun not installed. Downloading bun version ${BUN_VERSION}..."

  ARCH=$(uname -m)
  if [ "${ARCH}" = "aarch64" ] || [ "${ARCH}" = "arm64" ]; then
    BUN_PLATFORM="bun-linux-aarch64"
  elif [ "${ARCH}" = "x86_64" ]; then
    BUN_PLATFORM="bun-linux-x64"
  else
    echo "Unsupported architecture: ${ARCH}"
    exit 1
  fi

  mkdir -p "${LOCAL_BUN_DIR}"
  curl -fsSL "https://github.com/oven-sh/bun/releases/download/${BUN_VERSION}/${BUN_PLATFORM}.zip" -o "${LOCAL_BUN_DIR}/bun.zip"
  unzip -o "${LOCAL_BUN_DIR}/bun.zip" -d "${LOCAL_BUN_DIR}"
  chmod +x "${LOCAL_BUN_DIR}/${BUN_PLATFORM}/bun"
  export PATH="${LOCAL_BUN_DIR}/${BUN_PLATFORM}:${PATH}"
  echo "Bun installed locally at ${LOCAL_BUN_DIR}"
fi

if [ ! -f "${ENTRY_JS}" ]; then
  echo "Error: expected ESM entry at ${ENTRY_JS}. Run 'npm run build' first." >&2
  exit 1
fi

(
  cd "${DIST_DIR}"
  bun build "index.js" --compile --outfile "./${EXE_NAME}"
)
chmod +x "${DIST_DIR}/${EXE_NAME}"
