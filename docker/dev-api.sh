#!/bin/sh
set -e
cd /app/apps/api

# Bind mounts on Docker Desktop do not emit reliable inotify events.
export TSC_WATCHFILE="${TSC_WATCHFILE:-DynamicPriorityPolling}"
export TSC_WATCHDIRECTORY="${TSC_WATCHDIRECTORY:-DynamicPriorityPolling}"

echo "[dev-api] Compiling TypeScript..."
pnpm exec tsc -p tsconfig.build.json

echo "[dev-api] Starting tsc watch + node --watch..."
pnpm exec tsc -p tsconfig.build.json --watch --preserveWatchOutput \
  --watchFile dynamicPriorityPolling --watchDirectory dynamicPriorityPolling &
tsc_pid=$!

cleanup() {
  kill "$tsc_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

exec node --watch --watch-path=dist dist/main.js
