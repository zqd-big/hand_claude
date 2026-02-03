#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE_VERSION="${NODE_VERSION:-20.11.1}"
APP_NAME="hc-code"

BUILD_DIR="$ROOT_DIR/.package"
OUT_DIR="$ROOT_DIR/dist-packages"

if [ ! -f "$ROOT_DIR/dist/index.js" ]; then
  echo "dist/index.js not found. Run: npm run build" >&2
  exit 1
fi

if [ ! -d "$ROOT_DIR/node_modules" ]; then
  echo "node_modules not found. Run: npm ci" >&2
  exit 1
fi

OS_RAW="$(uname -s)"
ARCH_RAW="$(uname -m)"

case "$OS_RAW" in
  Linux*) PLATFORM_OS="linux" ;;
  Darwin*) PLATFORM_OS="darwin" ;;
  *)
    echo "Unsupported OS: $OS_RAW" >&2
    exit 1
    ;;
 esac

case "$ARCH_RAW" in
  x86_64|amd64) PLATFORM_ARCH="x64" ;;
  arm64|aarch64) PLATFORM_ARCH="arm64" ;;
  *)
    echo "Unsupported CPU architecture: $ARCH_RAW" >&2
    exit 1
    ;;
 esac

# Use tar.gz for both to simplify
ARCHIVE="node-v${NODE_VERSION}-${PLATFORM_OS}-${PLATFORM_ARCH}.tar.gz"
URL="https://nodejs.org/dist/v${NODE_VERSION}/${ARCHIVE}"

STAGING="$BUILD_DIR/${APP_NAME}-${PLATFORM_OS}-${PLATFORM_ARCH}"
RUNTIME_DIR="$STAGING/.runtime"
NODE_DIR="$RUNTIME_DIR/node-v${NODE_VERSION}-${PLATFORM_OS}-${PLATFORM_ARCH}"

mkdir -p "$BUILD_DIR" "$OUT_DIR" "$STAGING" "$RUNTIME_DIR"

if [ ! -f "$BUILD_DIR/$ARCHIVE" ]; then
  if command -v curl >/dev/null 2>&1; then
    curl -fL "$URL" -o "$BUILD_DIR/$ARCHIVE"
  elif command -v wget >/dev/null 2>&1; then
    wget -O "$BUILD_DIR/$ARCHIVE" "$URL"
  else
    echo "curl/wget not found. Please download $URL manually." >&2
    exit 1
  fi
fi

# Extract node runtime
if [ ! -x "$NODE_DIR/bin/node" ]; then
  tar -xzf "$BUILD_DIR/$ARCHIVE" -C "$RUNTIME_DIR"
fi

if [ ! -x "$NODE_DIR/bin/node" ]; then
  echo "Failed to setup Node runtime in $NODE_DIR" >&2
  exit 1
fi

# Copy app files
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete \
    --exclude '.runtime' \
    --exclude '.package' \
    --exclude 'dist-packages' \
    --exclude '.git' \
    "$ROOT_DIR/" "$STAGING/"
else
  # Fallback without rsync.
  # Note: tar excludes are relative to the ROOT_DIR.
  (cd "$ROOT_DIR" && tar -cf - \
    --exclude '.runtime' \
    --exclude '.package' \
    --exclude 'dist-packages' \
    --exclude '.git' \
    .) | (cd "$STAGING" && tar -xf -)
fi

# Ensure runtime is present (rsync may overwrite)
mkdir -p "$RUNTIME_DIR"
if [ ! -d "$NODE_DIR" ]; then
  cp -a "$RUNTIME_DIR/$(basename "$NODE_DIR")" "$NODE_DIR" 2>/dev/null || true
fi

# Make sure hc.sh is executable
chmod +x "$STAGING/hc.sh" || true

TAR_NAME="${APP_NAME}-${PLATFORM_OS}-${PLATFORM_ARCH}.tar.gz"
TAR_PATH="$OUT_DIR/$TAR_NAME"

cd "$BUILD_DIR"
rm -f "$TAR_PATH"
tar -czf "$TAR_PATH" "${APP_NAME}-${PLATFORM_OS}-${PLATFORM_ARCH}"

echo "Package created: $TAR_PATH"
