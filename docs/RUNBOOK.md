# Production Runbook

**Status:** Phase 13  
**Deployment detail:** [DEPLOYMENT.md](./DEPLOYMENT.md)

## Pre-deploy checklist

- [ ] Unique `AUTH_TOKEN_SECRET` set (not the `.env.example` placeholder)
- [ ] `NODE_ENV=production`
- [ ] `SWAGGER_ENABLED` unset or `false`
- [ ] `EMAIL_PROVIDER=smtp` with valid SMTP credentials
- [ ] HTTPS enabled on web and API
- [ ] Persistent volume mounted at `FILE_STORAGE_PATH` for API and worker
- [ ] Worker process running with shared DB/Redis/storage
- [ ] Staging smoke passed

## Deploy (Coolify)

1. Build and deploy web, api, worker from repo Dockerfiles
2. API entrypoint runs `prisma migrate deploy` automatically
3. Run `./scripts/deploy-checklist.sh` with `API_URL` set to staging/production API URL

## Post-deploy verification

```bash
curl -f https://api.example.com/health
curl -o /dev/null -w '%{http_code}' https://api.example.com/api/docs   # expect 404
```

Run the §87 acceptance workflow test against staging if possible, or verify manually through admin → dietitian → client flows.

## Backup schedule

Run daily via cron or Coolify scheduled task:

```bash
DATABASE_URL=... FILE_STORAGE_PATH=/data/storage BACKUP_DIR=/backups ./scripts/backup.sh
```

Verify weekly:

```bash
./scripts/verify-backup.sh /backups/<latest>
```

## Restore procedure

1. Provision replacement VPS / Coolify stack
2. Restore Postgres: `./scripts/restore.sh /backups/<timestamp>`
3. Deploy application containers with production env
4. Confirm `GET /health` → 200
5. Run tenant isolation smoke (`pnpm test test/security-isolation.spec.ts`)
6. Route DNS/traffic

Document RPO/RTO targets per business requirements (master spec §73).

## Incident response

| Symptom | Action |
|---|---|
| `/health` 503 database | Check Postgres connectivity and credentials |
| `/health` 503 redis | Check Redis; worker/automation will stall |
| `/health` 503 storage | Verify volume mount and permissions |
| Email not sending | Check SMTP env vars and provider logs |
| 429 spikes | Review throttle env vars; check for abuse |
| 5xx errors | Inspect structured error logs (`ERROR_TRACKING_ENABLED=true`) |

Never log or expose passwords, session tokens, or API secrets in incident notes.
