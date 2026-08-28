# Demo environment

Development-only realistic V1 dataset for multi-tenant demos and acceptance testing.

## Safety

`pnpm demo:reset` **wipes** the target database. It refuses to run unless:

1. `DEMO_ALLOW_RESET=1`
2. `NODE_ENV` is not `production`
3. Current database name is `nutrition` or `nutrition_demo`

It will **never** wipe `nutrition_test` (API tests) or unknown databases.

## Commands

```bash
# Against Docker/dev DB (database name "nutrition")
DEMO_ALLOW_RESET=1 pnpm demo:reset

# Seed without wipe (prefer reset for a clean world)
pnpm demo:seed

# Smaller food set during seed
DEMO_ALLOW_RESET=1 pnpm demo:reset -- --sample-catalog
```

`demo:reset` / `demo:seed`:

1. (reset only) wipe application tables  
2. seed entitlement catalog, platform settings, global habits  
3. import food catalog (curated by default) + Lebanon 2021 dishes/sweets + starter recipes (full mode)  
4. create users, practices, subscriptions, clients, and domain data  

## Default password

`DemoPass12!` (override with `DEMO_PASSWORD`)

## Accounts

| Role | Email | Notes |
|------|-------|-------|
| SUPER_ADMIN | `admin@demo.local` | Full platform admin |
| ADMIN | `platform-admin@demo.local` | Platform admin |
| Dietitian Alice | `dietitian.alice@demo.local` | Harbor Nutrition — **Standard** plan |
| Dietitian Bob | `dietitian.bob@demo.local` | Cedar Wellness — **Pro** plan |
| Dietitian Charlie | `dietitian.charlie@demo.local` | Lumen Dietetics — **Premium** plan |
| Shared patient | `patient.shared@demo.local` | Connected to Alice **and** Bob |
| Patients | `patient.emma@demo.local` … `patient.isabella@demo.local` | See matrix below |

## Practice ↔ patient matrix

**Harbor Nutrition (Alice / Standard)**

- Emma Rodriguez, James Chen, Olivia Park, Daniel Kim  
- Maya Thompson (shared)  
- Client limit **override = 6** (near-limit demo)  
- AI / automation **off** (Standard)

**Cedar Wellness (Bob / Pro)**

- Noah Williams, Sophia Martinez, Liam Anderson  
- Maya Thompson (shared)  
- AI + automation **on**

**Lumen Dietetics (Charlie / Premium)**

- Ava Patel, Ethan Brooks, Isabella Nguyen  
- AI + automation **on** (higher limits)

## Multi-dietitian patient

1. Login as `patient.shared@demo.local`  
2. Open `/client` → **Active practice** switcher  
3. Harbor connection shows Harbor meal plans / messages / docs only  
4. Cedar connection shows Cedar data only  

API: `POST /api/v1/portal/connections/active` with `{ clientId }`.

## AI note

Demo seed creates AI usage rows only when `AI_ENABLED=true`. UI AI requires env configuration; without it, skip AI demos. Acceptance AI tests force `AI_PROVIDER=mock`.

## Requirements

- Postgres (Docker: `POSTGRES_DB=nutrition`)  
- `FILE_STORAGE_PATH` (defaults to `apps/api/storage` in the CLI)  
- Redis for WebSocket demos (optional for seed itself)  

## Credentials policy

These accounts are **development-only**. Never use them in production. Never commit real secrets.
