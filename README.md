# Nutrition SaaS (Dietitian)

Modular monolith: Next.js web app, NestJS API + worker, PostgreSQL, Redis, Docker/Coolify.

Requires **Node.js 22** (see `.nvmrc`) and **pnpm 9.15.4**. Docker is used for Postgres and Redis (and optionally the full stack).

## Local setup

```bash
nvm use
cp .env.example .env
pnpm install
```

Generate a long random `AUTH_TOKEN_SECRET` in `.env` (32+ characters). Do not commit `.env`.

### Option A — Docker development (hot reload)

Starts Postgres, Redis, API, worker, and web in watch mode. Edit UI files on the host; Next.js Fast Refresh updates the browser without rebuilding a Docker image.

```bash
pnpm dev:docker
```

Equivalent Compose command:

```bash
docker compose -f docker-compose.dev.yml up
```

- Web: http://localhost:3000 (`next dev`)
- API: http://localhost:3001 (`tsc --watch` + `node --watch`)
- Health: http://localhost:3001/health
- OpenAPI: http://localhost:3001/api/docs
- Worker: `tsc --watch` + `node --watch dist/worker.js`

Do **not** rebuild for normal UI, CSS, or component edits. Use `--build` only when the development Dockerfile, OS packages, or the lockfile/base image change:

```bash
docker compose -f docker-compose.dev.yml up --build
```

This stack reuses the same `postgres_data` volume as the production-style Compose file, so existing local logins are preserved. Startup runs `prisma migrate deploy` only (never `migrate reset`). Do not run `docker compose -f docker-compose.dev.yml down -v` unless you intend to delete that database volume.

Stop this stack before starting the production-style stack (they share ports).

### Option B — production-style Docker stack (no hot reload)

Same images and process model as VPS/Coolify: compiled Next.js standalone server, compiled API, no source bind mounts.

```bash
docker compose up --build
```

- Web: http://localhost:3000 (`node apps/web/server.js`)
- API: http://localhost:3001
- Health: http://localhost:3001/health
- OpenAPI (when enabled): http://localhost:3001/api/docs

UI edits require an image rebuild. Do not use this command for day-to-day frontend work.

### Option C — app on the host, Postgres/Redis in Docker

```bash
docker compose up postgres redis
pnpm prisma:generate
pnpm prisma:migrate
pnpm --filter @nutrition-saas/api dev
pnpm --filter @nutrition-saas/api start:worker:dev
pnpm --filter @nutrition-saas/web dev
```

Verification emails print to the API console in development (`EMAIL_PROVIDER=console`).

## Common commands

```bash
pnpm typecheck
pnpm lint
pnpm test          # uses a separate nutrition_test database; does not wipe local Docker logins
```

Production deploy, backups, and Coolify notes: [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md).
