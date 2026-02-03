#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLI="$SCRIPT_DIR/dist/index.js"
DEFAULT_CONFIG="$SCRIPT_DIR/hcai.dashscope.config.json"

NODE_VERSION="${HCAI_NODE_VERSION:-20.11.1}"
ALLOW_DOWNLOAD="${HCAI_ALLOW_NODE_DOWNLOAD:-0}"

if [ ! -f "$CLI" ]; then
  echo "dist/index.js not found. Run build first." >&2
  exit 1
fi

HAS_CONFIG=0
for arg in "$@"; do
  if [ "$arg" = "--config" ]; then
    HAS_CONFIG=1
    break
  fi
done

get_node_major() {
  local node_cmd="$1"
  local v
  v="$($node_cmd -v 2>/dev/null || true)"
  v="${v#v}"
  v="${v%%.*}"
  if [[ "$v" =~ ^[0-9]+$ ]]; then
    echo "$v"
  else
    echo "0"
  fi
}

ensure_executable() {
  local f="$1"
  if [ -f "$f" ] && [ ! -x "$f" ]; then
    chmod +x "$f" 2>/dev/null || true
  fi
}

PLATFORM_OS=""
PLATFORM_ARCH=""
OS_RAW="$(uname -s)"
ARCH_RAW="$(uname -m)"

case "$OS_RAW" in
  Linux*) PLATFORM_OS="linux" ;;
  Darwin*) PLATFORM_OS="darwin" ;;
  *) PLATFORM_OS="" ;;
 esac

case "$ARCH_RAW" in
  x86_64|amd64) PLATFORM_ARCH="x64" ;;
  arm64|aarch64) PLATFORM_ARCH="arm64" ;;
  *) PLATFORM_ARCH="" ;;
 esac

NODE_CMD=""

# 1) Prefer bundled runtime in .runtime/
if [ -n "$PLATFORM_OS" ] && [ -n "$PLATFORM_ARCH" ]; then
  RUNTIME_DIR="$SCRIPT_DIR/.runtime"
  DEFAULT_NODE_DIR="$RUNTIME_DIR/node-v${NODE_VERSION}-${PLATFORM_OS}-${PLATFORM_ARCH}"
  NODE_DIR="${HCAI_NODE_DIR:-$DEFAULT_NODE_DIR}"
  NODE_EXE="$NODE_DIR/bin/node"

  if [ -f "$NODE_EXE" ]; then
    ensure_executable "$NODE_EXE"
    if [ -x "$NODE_EXE" ]; then
      NODE_CMD="$NODE_EXE"
    else
      echo "Found bundled Node runtime but it is not executable: $NODE_EXE" >&2
      echo "Try on Linux/macOS: chmod +x '$NODE_EXE'" >&2
      exit 1
    fi
  fi
fi

# 2) Fallback to system node (must be >= 20)
if [ -z "$NODE_CMD" ] && command -v node >/dev/null 2>&1; then
  SYSTEM_NODE="node"
  MAJOR="$(get_node_major "$SYSTEM_NODE")"
  if [ "$MAJOR" -ge 20 ]; then
    NODE_CMD="$SYSTEM_NODE"
  else
    echo "System node is too old: $(node -v 2>/dev/null || true). Require >= 20." >&2
    echo "Use bundled runtime (.runtime/) or install Node 20+." >&2
    exit 1
  fi
fi

# 3) Optional: allow downloading Node runtime (explicit opt-in)
if [ -z "$NODE_CMD" ] && [ "$ALLOW_DOWNLOAD" = "1" ]; then
  if [ -z "$PLATFORM_OS" ] || [ -z "$PLATFORM_ARCH" ]; then
    echo "Cannot auto-download Node: unsupported platform ($OS_RAW / $ARCH_RAW)." >&2
    exit 1
  fi

  RUNTIME_DIR="$SCRIPT_DIR/.runtime"
  DEFAULT_NODE_DIR="$RUNTIME_DIR/node-v${NODE_VERSION}-${PLATFORM_OS}-${PLATFORM_ARCH}"
  NODE_EXE="$DEFAULT_NODE_DIR/bin/node"

  mkdir -p "$RUNTIME_DIR"

  ARCHIVE="node-v${NODE_VERSION}-${PLATFORM_OS}-${PLATFORM_ARCH}.tar.gz"
  URL="https://nodejs.org/dist/v${NODE_VERSION}/${ARCHIVE}"

  if [ ! -f "$RUNTIME_DIR/$ARCHIVE" ]; then
    if command -v curl >/dev/null 2>&1; then
      curl -fL "$URL" -o "$RUNTIME_DIR/$ARCHIVE"
    elif command -v wget >/dev/null 2>&1; then
      wget -O "$RUNTIME_DIR/$ARCHIVE" "$URL"
    else
      echo "curl/wget not found. Please install Node manually." >&2
      exit 1
    fi
  fi

  if ! command -v tar >/dev/null 2>&1; then
    echo "tar not found. Please install tar or Node manually." >&2
    exit 1
  fi

  tar -xzf "$RUNTIME_DIR/$ARCHIVE" -C "$RUNTIME_DIR"

  if [ ! -f "$NODE_EXE" ]; then
    echo "Failed to setup Node runtime at: $NODE_EXE" >&2
    exit 1
  fi

  ensure_executable "$NODE_EXE"
  if [ ! -x "$NODE_EXE" ]; then
    echo "Node runtime extracted but not executable: $NODE_EXE" >&2
    exit 1
  fi

  NODE_CMD="$NODE_EXE"
fi

# 4) Hard fail (offline-friendly)
if [ -z "$NODE_CMD" ]; then
  echo "node not found." >&2
  echo "Offline mode: prepare a bundled runtime under .runtime/ then copy this folder to Linux/macOS." >&2
  echo "Windows (online): .\\scripts\\prepare-offline-runtime.ps1 -TargetOS linux -TargetArch x64" >&2
  echo "Linux/macOS (online): TARGET_OS=linux TARGET_ARCH=x64 ./scripts/prepare-offline-runtime.sh" >&2
  echo "Or install Node 20+." >&2
  echo "(Online optional) Set HCAI_ALLOW_NODE_DOWNLOAD=1 to auto-download Node runtime." >&2
  exit 1
fi

if [ "$HAS_CONFIG" -eq 1 ]; then
  "$NODE_CMD" "$CLI" "$@"
else
  if [ ! -f "$DEFAULT_CONFIG" ]; then
    echo "Config not found: $DEFAULT_CONFIG" >&2
    exit 1
  fi
  "$NODE_CMD" "$CLI" "$@" --config "$DEFAULT_CONFIG"
fi