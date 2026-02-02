#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLI="$SCRIPT_DIR/dist/index.js"
DEFAULT_CONFIG="$SCRIPT_DIR/hcai.dashscope.config.json"

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

if [ "$HAS_CONFIG" -eq 1 ]; then
  node "$CLI" "$@"
else
  if [ ! -f "$DEFAULT_CONFIG" ]; then
    echo "Config not found: $DEFAULT_CONFIG" >&2
    exit 1
  fi
  node "$CLI" "$@" --config "$DEFAULT_CONFIG"
fi