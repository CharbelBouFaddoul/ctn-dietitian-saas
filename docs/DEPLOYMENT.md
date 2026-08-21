# Deployment

**Status:** Phase 13 production hardening implemented  
**Target:** Hostinger VPS + Coolify + Docker

## Local development

Day-to-day UI work (Next.js Fast Refresh, no image rebuild on save):

```bash
cp .env.example .env
pnpm dev:docker
```

That runs `docker compose -f docker-compose.dev.yml up`. Rebuild the development image only when `docker/dev.Dockerfile`, OS packages, or the lockfile/base image change (`docker compose -f docker-compose.dev.yml up --build`).

Production-style local stack (compiled Next standalone, same as Coolify — not for UI iteration):

```bash
docker compose up --build
```

Services: `web` (3000), `api` (3001), `worker`, `postgres`, `redis`.

API health: `GET http://localhost:3001/health`  
OpenAPI (dev): `http://localhost:3001/api/docs`

Host-only API/web against Compose Postgres/Redis:

```bash
docker compose up postgres redis
pnpm prisma:generate
pnpm prisma:migrate
pnpm --filter @nutrition-saas/api dev
pnpm --filter @nutrition-saas/api start:worker:dev
pnpm --filter @nutrition-saas/web dev
```

## Production (Coolify on Hostinger VPS)

Run three application services from the same images:

| Service | Image | Command |
|---|---|---|
| Web | `docker/web.Dockerfile` | default |
| API | `docker/api.Dockerfile` | `api-entrypoint.sh` (migrate + HTTP) |
| Worker | `docker/api.Dockerfile` | `worker-entrypoint.sh` |

Plus managed PostgreSQL, Redis, and a persistent volume mounted at `FILE_STORAGE_PATH` (`/data/storage`).

Document binaries live under `$FILE_STORAGE_PATH/dietitians/{dietitianAccountId}/clients/{clientId}/`. API and worker containers must share the same volume mount. All binary uploads go through `StorageService` under this root so one Coolify volume covers documents and any future upload types (photos, etc.).

### Coolify persistent storage checklist

1. Attach a **persistent volume** to the **API** service at `/data/storage` (named volume or host bind that survives redeploys — not an ephemeral container filesystem).
2. If you run a **worker**, mount the **same** volume at `/data/storage` on that service too.
3. Set `FILE_STORAGE_PATH=/data/storage` on API and worker (same value everywhere).
4. Do **not** point `FILE_STORAGE_PATH` at a path inside the image or an unsaved container layer; uploads will disappear on every deploy.
5. After first deploy, confirm a test upload creates files under `/data/storage/dietitians/...` on the volume and that downloads still work after a redeploy.
6. Optional: `MAX_DOCUMENT_BYTES` (default `20971520` = 20 MB) for upload size; keep UI and API aligned if you change it.

### Required production environment

| Variable | Requirement |
|---|---|
| `NODE_ENV` | `production` |
| `AUTH_TOKEN_SECRET` | Unique 32+ character secret (default placeholder rejected at startup) |
| `SWAGGER_ENABLED` | Unset or `false` (OpenAPI not public) |
| `CORS_ORIGIN` | Production web origin(s), comma-separated |
| `APP_URL` | Public web URL for email links |
| `NEXT_PUBLIC_API_URL` | Public API URL for the web container |
| `DATABASE_URL` | Production PostgreSQL |
| `REDIS_URL` | Production Redis |
| `FILE_STORAGE_PATH` | `/data/storage` with persistent volume |

HTTPS is required for `Secure` session cookies. The API sets `trust proxy` for Coolify.

### Email (Phase 13)

| Variable | Purpose |
|---|---|
| `EMAIL_PROVIDER` | `console` (dev) or `smtp` (production) |
| `EMAIL_FROM` | From address (required for SMTP) |
| `SMTP_HOST` / `SMTP_PORT` | SMTP server |
| `SMTP_USER` / `SMTP_PASSWORD` | Optional auth |
| `SMTP_SECURE` | `true` for TLS on port 465 |

Production with `EMAIL_PROVIDER=smtp` requires `EMAIL_FROM`, `SMTP_HOST`, and `SMTP_PORT`.

### Rate limiting (Phase 13)

| Variable | Default | Protects |
|---|---|---|
| `AUTH_THROTTLE_*` | 10 / 60s | `/api/v1/auth/*` |
| `MESSAGING_THROTTLE_*` | 30 / 60s | Message send endpoints |
| `UPLOAD_THROTTLE_*` | 20 / 60s | Document upload endpoints |
| `AI_THROTTLE_*` | 20 / 60s | Client AI generation endpoints |

### AI (Phase 11)

| Variable | Purpose |
|---|---|
| `AI_ENABLED` | Set `false` to disable AI runtime without removing routes |
| `AI_PROVIDER` | `mock` (default, no key) or `openai` |
| `AI_API_KEY` | Provider secret — server-side only, never commit |
| `AI_MODEL` | Model id (default `gpt-4o-mini`) |
| `AI_BASE_URL` | Optional provider base URL |
| `AI_TIMEOUT_MS` | Provider timeout |
| `AI_MAX_INPUT_TOKENS` / `AI_MAX_OUTPUT_TOKENS` | Server-side caps |

Development and tests use `AI_PROVIDER=mock` without a real API key. Production OpenAI requires `AI_PROVIDER=openai` and `AI_API_KEY`.

### Automation (Phase 12)

The **worker** process runs the BullMQ `automation` queue with a repeatable sweep every **5 minutes**. The API enqueues nothing by default; rule CRUD is synchronous HTTP.

Worker must share `DATABASE_URL`, `REDIS_URL`, and the same Prisma migrations as the API (12 migrations through `20260818080000_automation`).

Automation entitlements are plan-driven (`AUTOMATION`, `AUTOMATION_RULE_LIMIT`, `AUTOMATION_EXECUTION_LIMIT`). No extra env vars required beyond existing Redis/worker setup.

### Error tracking (Phase 13)

Set `ERROR_TRACKING_ENABLED=true` to emit structured JSON error logs for 5xx responses. Forward container logs to your monitoring provider (Coolify log drain, Sentry, etc.).

## Environments

Maintain separate **development**, **staging**, and **production** with isolated databases, credentials, AI keys, email, storage, and Redis (master spec §82).

Suggested staging flow: deploy to Coolify staging → run `scripts/deploy-checklist.sh` → run acceptance tests → promote to production.

## Backups (Phase 13)

Back up PostgreSQL, uploaded files, and critical configuration. Suggested retention: **7 daily**, **4 weekly** (master spec §72).

```bash
export DATABASE_URL=postgresql://...
export FILE_STORAGE_PATH=/data/storage
./scripts/backup.sh
./scripts/verify-backup.sh backups/<timestamp>
```

Restore drill (isolated instance):

```bash
./scripts/restore.sh backups/<timestamp>
pnpm prisma:migrate
curl -f http://localhost:3001/health
pnpm test
```

Treat backup artifacts as sensitive (full tenant data).

## Monitoring

Monitor via Coolify/VPS:

- Infrastructure: CPU, RAM, disk, Postgres, Redis, storage volume
- Application: `GET /health` uptime (200 = ok, 503 = degraded)
- Logs: failed automation jobs, email send failures, 5xx error JSON

Use `scripts/deploy-checklist.sh` after deploy to verify health and confirm `/api/docs` is not publicly reachable.

## CI

GitHub Actions runs typecheck, lint, and the full API test suite (109 tests) with Postgres and Redis services.
