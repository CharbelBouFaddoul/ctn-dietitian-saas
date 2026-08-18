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

### Option A — full Docker stack

```bash
docker compose up --build
```

- Web: http://localhost:3000
- API: http://localhost:3001
- Health: http://localhost:3001/health
- OpenAPI (dev): http://localhost:3001/api/docs

### Option B — app on the host, Postgres/Redis in Docker

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
pnpm test
```

Production deploy, backups, and Coolify notes: [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md).
