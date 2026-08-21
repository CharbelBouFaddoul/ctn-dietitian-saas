# Testing

## Suites

| Command | What |
|---------|------|
| `pnpm test` | All API Vitest suites (unit + e2e) |
| `pnpm --filter @nutrition-saas/api test test/v1-acceptance` | V1 demo acceptance suites |
| `pnpm typecheck` | Turbo typecheck |
| `pnpm lint` | ESLint |

API e2e always targets database **`nutrition_test`** (see `apps/api/test/setup-env.ts`). Wipes refuse any other DB name.

## V1 acceptance layout

```text
apps/api/test/v1-acceptance/
  helpers.ts
  auth.e2e.spec.ts
  admin.e2e.spec.ts
  isolation.e2e.spec.ts
  multi-dietitian.e2e.spec.ts
  food-recipe-meal.e2e.spec.ts
  tracking-evolution.e2e.spec.ts
  appointments-messaging.e2e.spec.ts
  invoices-tasks-analytics.e2e.spec.ts
  automation.e2e.spec.ts
  ai-mock.e2e.spec.ts          # skipped when AI_ENABLED=false
  snapshots.e2e.spec.ts
  lifecycle.e2e.spec.ts
```

Each suite reseeds a **sample** food catalog + full multi-tenant demo world via `seedDemoWorld` (same modules as `pnpm demo:reset`).

## Existing phase suites

Do not remove or weaken:

- `security-isolation.spec.ts`
- `acceptance-workflow.e2e.spec.ts`
- phase\* e2e specs

## Browser E2E

There is **no** Playwright/Cypress setup in this repo. Use API acceptance + the manual checklist in [QA.md](./QA.md).

## Environment for tests

- Postgres `nutrition_test`  
- Redis  
- `FILE_STORAGE_PATH`  
- `AI_PROVIDER=mock` (default) for AI suites  

Inside Docker Compose (`api` service), pass hostnames the container can reach:

```bash
docker compose -f docker-compose.dev.yml exec -T api sh -c \
  'cd /app/apps/api && \
   TEST_DATABASE_URL="postgresql://nutrition:nutrition@postgres:5432/nutrition_test?schema=public" \
   REDIS_URL="redis://redis:6379" \
   FILE_STORAGE_PATH="/app/apps/api/storage" \
   pnpm test test/v1-acceptance'
```

## Demo reset vs tests

| | Demo CLI | Vitest |
|--|----------|--------|
| DB | `nutrition` / `nutrition_demo` | `nutrition_test` |
| Guard | `DEMO_ALLOW_RESET=1` | `assertTestWipeAllowed` |
| Catalog | curated (+ recipes) by default | sample foods |
