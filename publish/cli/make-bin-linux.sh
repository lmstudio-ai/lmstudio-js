#!/bin/bash
set -euo pipefail

BUN_VERSION="1.3.3"
BUN_TAG="bun-v${BUN_VERSION}"
DIST_DIR="./dist"
EXE_NAME="lms"
ENTRY_JS="./dist/index.js"

LOCAL_BUN_DIR="./temp/${BUN_TAG}"

ARCH="$(uname -m)"
if [ "${ARCH}" = "aarch64" ] || [ "${ARCH}" = "arm64" ]; then
  BUN_PLATFORM="bun-linux-aarch64"
elif [ "${ARCH}" = "x86_64" ]; then
  BUN_PLATFORM="bun-linux-x64"
else
  echo "Unsupported architecture: ${ARCH}"
  exit 1
fi

LOCAL_BUN_RELATIVE_BINARY="${BUN_PLATFORM}/bun"

if [ ! -x "${LOCAL_BUN_DIR}/${LOCAL_BUN_RELATIVE_BINARY}" ]; then
  echo "${BUN_TAG} not present. Downloading..."
  mkdir -p "${LOCAL_BUN_DIR}"
  curl -fsSL "https://github.com/oven-sh/bun/releases/download/${BUN_TAG}/${BUN_PLATFORM}.zip" -o "${LOCAL_BUN_DIR}/bun.zip"
  unzip -o "${LOCAL_BUN_DIR}/bun.zip" -d "${LOCAL_BUN_DIR}"
  chmod +x "${LOCAL_BUN_DIR}/${LOCAL_BUN_RELATIVE_BINARY}"
  rm -f "${LOCAL_BUN_DIR}/bun.zip"
fi

LOCAL_BUN_ABSOLUTE_DIR="$(cd "${LOCAL_BUN_DIR}" && pwd)"
BUN_CMD="${LOCAL_BUN_ABSOLUTE_DIR}/${LOCAL_BUN_RELATIVE_BINARY}"

echo "Using bun at ${BUN_CMD}"

if [ ! -f "${ENTRY_JS}" ]; then
  echo "Error: expected ESM entry at ${ENTRY_JS}. Run 'npm run build' first." >&2
  exit 1
fi

(
  cd "${DIST_DIR}"
  "${BUN_CMD}" build "index.js" --compile --outfile "./${EXE_NAME}"
)
chmod +x "${DIST_DIR}/${EXE_NAME}"
