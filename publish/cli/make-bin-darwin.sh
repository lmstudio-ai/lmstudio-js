#!/bin/bash

BUN_VERSION="bun-v1.3.3"
DIST_DIR="./dist"
EXE_NAME="lms"
ENTRY_JS="./dist/index.js"

KEYCHAIN_ARGUMENTS=()
if [[ -n "${APPLE_KEYCHAIN}" ]]; then
  KEYCHAIN_ARGUMENTS+=("--keychain" "${APPLE_KEYCHAIN}")
fi

load_env_from_ancestors() {
  local current_dir
  current_dir=$(pwd)
  while [ "$current_dir" != "/" ]; do
    if [ -f "$current_dir/.env" ]; then
      echo "Loading .env from $current_dir"
      set -a
      . "$current_dir/.env"
      set +a
    fi
    current_dir=$(dirname "$current_dir")
  done
}

load_env_from_ancestors

if ! command -v bun >/dev/null 2>&1; then
  echo "bun not found. Installing bun..."
  curl -fsSL https://bun.sh/install | bash -s "${BUN_VERSION}"

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
  bun build "./index.js" --compile --outfile "./${EXE_NAME}"
)
chmod +x "${DIST_DIR}/${EXE_NAME}"

if [[ -z "${LMS_NO_SIGN}" ]]; then

  if [[ -z "${APPLE_SIGNING_IDENTITY}" ]]; then
    echo "ERROR: APPLE_SIGNING_IDENTITY is not set"
    exit 1
  fi

  if ! command -v codesign &> /dev/null
  then
  echo "Warning: codesign could not be found"
  exit 1
  fi
  if [[ -n "${DIST_DIR}" ]] && [[ -n "${EXE_NAME}" ]]; then
    codesign --sign "${APPLE_SIGNING_IDENTITY}" --options runtime --entitlements entitlements.plist "${DIST_DIR}/${EXE_NAME}"
    if [ "$LMS_SKIP_NOTARIZATION" = "1" ] || [ "$LMS_SKIP_NOTARIZATION" = "true" ]; then
      echo "LMS_SKIP_NOTARIZATION is set. Skipping notarization..."
    else
      zip -r "${DIST_DIR}/${EXE_NAME}.zip" "${DIST_DIR}/${EXE_NAME}"
      xcrun notarytool submit "${DIST_DIR}/${EXE_NAME}.zip" --keychain-profile "AC_PASSWORD" "${KEYCHAIN_ARGUMENTS[@]}" --wait
    fi
  else
    echo "Warning: DIST_DIR or EXE_NAME is not set"
    exit 1
  fi

fi
