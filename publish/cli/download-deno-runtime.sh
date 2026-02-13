#!/bin/bash

DENO_VERSION="v2.3.6"
TEMP_DIR="./temp"
DIST_DIR="./dist"

# Detect the operating system and architecture
OS=$(uname -s)
ARCH=$(uname -m)

# Map the architecture to the appropriate suffix
case $ARCH in
  x86_64)
    ARCH_SUFFIX="x86_64"
    ;;
  arm64|aarch64)
    ARCH_SUFFIX="aarch64"
    ;;
  *)
    echo "Unsupported architecture: $ARCH"
    exit 1
    ;;
esac

# Set the download URL based on the operating system and architecture
if [[ "$OS" == "Linux" ]]; then
  DENO_DOWNLOAD_URL="https://github.com/denoland/deno/releases/download/${DENO_VERSION}/deno-${ARCH_SUFFIX}-unknown-linux-gnu.zip"
elif [[ "$OS" == "Darwin" ]]; then
  DENO_DOWNLOAD_URL="https://github.com/denoland/deno/releases/download/${DENO_VERSION}/deno-${ARCH_SUFFIX}-apple-darwin.zip"
else
  echo "Unsupported operating system: $OS"
  exit 1
fi

# Create temp and dist directories if they don't exist
mkdir -p "$TEMP_DIR"
mkdir -p "$DIST_DIR"

if [[ ! -f "${DIST_DIR}/deno" ]]; then
  echo "Deno not found. Downloading..."
  DENO_ZIP="${TEMP_DIR}/deno.zip"
  curl -L -o "$DENO_ZIP" "$DENO_DOWNLOAD_URL"
  python -c "import zipfile; zipfile.ZipFile('$DENO_ZIP').extractall('$TEMP_DIR')"
  mv "${TEMP_DIR}/deno" "$DIST_DIR"
  echo "Deno downloaded and extracted."
else
  echo "Deno already downloaded."
fi
