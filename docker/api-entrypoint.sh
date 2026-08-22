#!/bin/sh
set -e
cd /app
pnpm --filter @nutrition-saas/api exec prisma migrate deploy
exec node apps/api/dist/main.js
