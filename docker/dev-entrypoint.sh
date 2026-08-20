#!/bin/sh
set -e
cd /app

echo "[dev] Syncing workspace dependencies..."
pnpm install --frozen-lockfile

echo "[dev] Generating Prisma client..."
pnpm --filter @nutrition-saas/api exec prisma generate

if [ "${BUILD_PACKAGES:-false}" = "true" ]; then
  echo "[dev] Building workspace packages..."
  pnpm --filter "./packages/*" build
fi

if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  echo "[dev] Applying Prisma migrations (prisma migrate deploy)..."
  pnpm --filter @nutrition-saas/api exec prisma migrate deploy
fi

exec "$@"
