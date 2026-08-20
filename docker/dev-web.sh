#!/bin/sh
set -e
cd /app

# Keep @nutrition-saas/ui dist in sync so Next can pick up design-system source edits.
pnpm --filter @nutrition-saas/ui exec tsc -p tsconfig.json --watch --preserveWatchOutput \
  --watchFile dynamicPriorityPolling --watchDirectory dynamicPriorityPolling &

exec pnpm --filter @nutrition-saas/web dev
