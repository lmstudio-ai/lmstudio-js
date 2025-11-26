#!/bin/bash
set -euo pipefail

BUN_VERSION="bun-v1.3.3"
DIST_DIR="./dist"
EXE_NAME="lms"
ENTRY_JS="./dist/index.js"

if ! command -v bun >/dev/null 2>&1; then
  echo "bun not found. Installing bun..."
  curl -fsSL https://bun.sh/install | bash -s "$BUN_VERSION"

  # Source bun setup
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"

  if ! command -v bun >/dev/null 2>&1; then
    echo "Error: Failed to install bun" >&2
    exit 1
  fi
  echo "bun installed successfully"
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
