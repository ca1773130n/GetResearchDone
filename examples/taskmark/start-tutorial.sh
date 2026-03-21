#!/bin/bash
# Launch the GRD interactive tutorial
#
# Usage:
#   ./start-tutorial.sh                              # auto-detects claude binary
#   ./start-tutorial.sh --bin my-claude              # custom binary name
#   ./start-tutorial.sh --config ~/.claude-work      # custom config dir
#   ./start-tutorial.sh --bin my-claude --config ~/.claude-work

set -e
cd "$(dirname "$0")"

CLAUDE_BIN=""
CONFIG_DIR=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --bin)    CLAUDE_BIN="$2"; shift 2 ;;
    --config) CONFIG_DIR="$2"; shift 2 ;;
    *)        CLAUDE_BIN="$1"; shift ;;  # bare arg = binary name for backward compat
  esac
done

if [ -z "$CLAUDE_BIN" ]; then
  for candidate in claude claude-code; do
    if command -v "$candidate" &>/dev/null; then
      CLAUDE_BIN="$candidate"
      break
    fi
  done
fi

if [ -z "$CLAUDE_BIN" ]; then
  echo "Error: Could not find Claude Code binary."
  echo ""
  echo "Usage:"
  echo "  ./start-tutorial.sh --bin <claude-binary> [--config <config-dir>]"
  echo ""
  echo "Examples:"
  echo "  ./start-tutorial.sh --bin claude-work"
  echo "  ./start-tutorial.sh --bin claude --config ~/.claude-personal"
  echo ""
  echo "Or start manually:"
  echo "  cd examples/taskmark && <your-claude> \"Start the tutorial\""
  exit 1
fi

if [ -n "$CONFIG_DIR" ]; then
  export CLAUDE_CONFIG_DIR="$CONFIG_DIR"
fi

exec "$CLAUDE_BIN" "Start the tutorial"
