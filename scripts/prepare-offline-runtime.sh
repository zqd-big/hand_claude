#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE_VERSION="${NODE_VERSION:-20.11.1}"
TARGET_OS="${TARGET_OS:-linux}"
TARGET_ARCH="${TARGET_ARCH:-x64}"

RUNTIME_DIR="$ROOT_DIR/.runtime"
NODE_DIR="$RUNTIME_DIR/node-v${NODE_VERSION}-${TARGET_OS}-${TARGET_ARCH}"
NODE_EXE="$NODE_DIR/bin/node"
ARCHIVE="node-v${NODE_VERSION}-${TARGET_OS}-${TARGET_ARCH}.tar.gz"
URL="https://nodejs.org/dist/v${NODE_VERSION}/${ARCHIVE}"

mkdir -p "$RUNTIME_DIR"

if [ -x "$NODE_EXE" ]; then
  echo "Node runtime already present: $NODE_EXE"
  exit 0
fi

if command -v curl >/dev/null 2>&1; then
  curl -fL "$URL" -o "$RUNTIME_DIR/$ARCHIVE"
elif command -v wget >/dev/null 2>&1; then
  wget -O "$RUNTIME_DIR/$ARCHIVE" "$URL"
else
  echo "curl/wget not found. Please download $URL manually." >&2
  exit 1
fi

if ! command -v tar >/dev/null 2>&1; then
  echo "tar not found. Please install tar or extract manually." >&2
  exit 1
fi

tar -xzf "$RUNTIME_DIR/$ARCHIVE" -C "$RUNTIME_DIR"

if [ ! -x "$NODE_EXE" ]; then
  echo "Failed to setup Node runtime in $NODE_DIR" >&2
  exit 1
fi

echo "Node runtime prepared: $NODE_EXE"