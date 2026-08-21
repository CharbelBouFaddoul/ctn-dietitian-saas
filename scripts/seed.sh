#!/bin/sh
# Prefer: DEMO_ALLOW_RESET=1 pnpm demo:reset
set -e
cd "$(dirname "$0")/.."
export DEMO_ALLOW_RESET="${DEMO_ALLOW_RESET:-}"
exec pnpm demo:reset "$@"
