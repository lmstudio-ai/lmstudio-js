#!/bin/bash
set -euo pipefail

NODE_VERSION="v20.12.2"
ARCH=$(uname -m)
TEMP_DIR="./temp"
DIST_DIR="./dist"
NODE_TAR="${TEMP_DIR}/node.tar.xz"
NODE_DIR="${TEMP_DIR}/node"
EXE_NAME="lms"

case $ARCH in
  x86_64)
    ARCH_SUFFIX="x64"
    ;;
  arm64 | aarch64)
    ARCH_SUFFIX="arm64"
    ;;
  *)
    echo "Unsupported architecture: $ARCH"
    exit 1
    ;;
esac
NODE_DOWNLOAD_URL="https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-${ARCH_SUFFIX}.tar.xz"

load_env_from_ancestors() {
  local current_dir=$(pwd)
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

mkdir -p $TEMP_DIR
mkdir -p $DIST_DIR

if [ ! -f "${NODE_DIR}/bin/node" ]; then
  echo "Node.js not found. Downloading..."
  curl $NODE_DOWNLOAD_URL --output $NODE_TAR
  tar -xf $NODE_TAR -C $TEMP_DIR
  mv "${TEMP_DIR}/node-${NODE_VERSION}-linux-${ARCH_SUFFIX}" $NODE_DIR
  rm $NODE_TAR
else
  echo "Node.js already downloaded."
fi

"${NODE_DIR}/bin/node" --experimental-sea-config ./sea-config.json

cp "${NODE_DIR}/bin/node" "${DIST_DIR}/${EXE_NAME}"

postject "${DIST_DIR}/${EXE_NAME}" NODE_SEA_BLOB ./temp/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
