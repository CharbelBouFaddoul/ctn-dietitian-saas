# V1 Demo — Full Report

Development-only multi-tenant demo for the Nutrition SaaS V1 product.  
This document is the complete recap: credentials, practices, seeded data, product features, how to run, and how to test.

---

## 1. Purpose

Prove that V1 works as one coherent product under realistic conditions:

- Multiple platform admins
- Multiple independent dietitian practices
- Multiple patients
- One patient connected to two dietitians (isolation on switch)
- Different subscription plans (Standard / Pro / Premium)
- Food → recipe → meal plan → publish → patient tracking
- Messaging, appointments, invoices, tasks, automation, documents, analytics

**Not** a new product phase. No production secrets. Destructive reset is safety-gated.

---

## 2. Quick start

```bash
# App running (e.g. pnpm dev:docker)
DEMO_ALLOW_RESET=1 pnpm demo:reset
```

Then open:

| Surface | URL |
|---------|-----|
| Marketing | `/` |
| Admin login | `/admin/login` |
| Dietitian login | `/auth/dietitian/login` |
| Patient login | `/auth/client/login` |

---

## 3. Password (all accounts)

```text
DemoPass12!
```

Override at seed time with env `DEMO_PASSWORD` if needed.

---

## 4. All login accounts

### Platform

| Role | Email | Password | Where to login |
|------|-------|----------|----------------|
| SUPER_ADMIN | `admin@demo.local` | `DemoPass12!` | `/admin/login` |
| ADMIN | `platform-admin@demo.local` | `DemoPass12!` | `/admin/login` |

### Dietitians

| Name | Practice | Plan | Email | Password | Where |
|------|----------|------|-------|----------|-------|
| Alice Nguyen | Harbor Nutrition | **Standard** | `dietitian.alice@demo.local` | `DemoPass12!` | `/auth/dietitian/login` |
| Bob Okonkwo | Cedar Wellness Clinic | **Pro** | `dietitian.bob@demo.local` | `DemoPass12!` | `/auth/dietitian/login` |
| Charlie Silva | Lumen Dietetics | **Premium** | `dietitian.charlie@demo.local` | `DemoPass12!` | `/auth/dietitian/login` |

### Patients

| Name | Email | Password | Connected to |
|------|-------|----------|--------------|
| Emma Rodriguez | `patient.emma@demo.local` | `DemoPass12!` | Alice (Harbor) |
| James Chen | `patient.james@demo.local` | `DemoPass12!` | Alice |
| Olivia Park | `patient.olivia@demo.local` | `DemoPass12!` | Alice |
| Daniel Kim | `patient.daniel@demo.local` | `DemoPass12!` | Alice |
| **Maya Thompson (shared)** | `patient.shared@demo.local` | `DemoPass12!` | **Alice + Bob** |
| Noah Williams | `patient.noah@demo.local` | `DemoPass12!` | Bob (Cedar) |
| Sophia Martinez | `patient.sophia@demo.local` | `DemoPass12!` | Bob |
| Liam Anderson | `patient.liam@demo.local` | `DemoPass12!` | Bob |
| Ava Patel | `patient.ava@demo.local` | `DemoPass12!` | Charlie (Lumen) |
| Ethan Brooks | `patient.ethan@demo.local` | `DemoPass12!` | Charlie |
| Isabella Nguyen | `patient.isabella@demo.local` | `DemoPass12!` | Charlie |

Patient UI: `/auth/client/login` → `/client`.

---

## 5. Practice map (what each world contains)

### Harbor Nutrition — Alice (Standard)

- **Plan:** Standard → AI off, Automation off, client limit overridden to **6** (near-limit demo; 5 clients seeded)
- **Clients:** Emma, James, Olivia, Daniel, Maya (shared)
- **Distinct markers:** tags like `athlete`, `harbor-priority`; notes say “Harbor”
- **Custom food:** Harbor Protein Smoothie Base (Alice-only)
- **Recipe:** Harbor Power Bowl
- **Meal plans:** Emma Race Prep 14-day (published), James draft 7-day, Olivia 28-day published, Maya@Harbor hypertrophy
- **Tracking:** ~2 weeks food/water/exercise/sleep/habits for Emma + planned-meal log
- **Evolution:** Emma weight trend ~62.4 → 59.9 kg + height/waist
- **Assessment:** Harbor Intake completed for Emma
- **Appointments:** completed, today, future, cancelled
- **Chat:** multi-message thread with Emma (unread for Alice)
- **Invoices:** HN-0001… statuses DRAFT / ISSUED / SENT / PAID / OVERDUE / CANCELLED
- **Tasks:** TODO / IN_PROGRESS / COMPLETED
- **Documents:** shared `harbor-notes.txt` for Emma

### Cedar Wellness — Bob (Pro)

- **Plan:** Pro → AI on, Automation on
- **Clients:** Noah, Sophia, Liam, Maya (shared)
- **Custom food:** Cedar Spiced Oat Blend (Bob-only)
- **Recipe:** Cedar Overnight Oats
- **Meal plans:** Noah Fat-Loss Week published, Maya@Cedar Cut Phase
- **Appointments:** reschedule-pending for Noah
- **Chat:** Noah unread message
- **Invoices:** CW-* lifecycle set
- **Tasks:** overdue urgent for Noah
- **Automation rules:** Invoice overdue → task; Appointment upcoming → notify
- **Documents:** `cedar-notes.txt` for Noah

### Lumen Dietetics — Charlie (Premium)

- **Plan:** Premium → higher AI/automation limits
- **Clients:** Ava, Ethan, Isabella
- **Meal plan:** Ava Low-FODMAP 21-day draft
- **Tasks:** cancelled example
- **Automation:** Meal plan ending → client notification

---

## 6. Multi-dietitian patient (critical demo)

**Account:** `patient.shared@demo.local` / `DemoPass12!`

1. Login → `/client`
2. Footer **Active practice** switcher (Harbor ↔ Cedar)
3. Harbor active → only Harbor meal plan, messages, docs, invoices, tracking for Maya’s Alice client row
4. Switch to Cedar → only Cedar data

Nothing from Alice may appear under Bob’s active connection (and the reverse).

API: `GET /api/v1/portal/connections` then `POST /api/v1/portal/connections/active` with `{ clientId }`.

---

## 7. Subscription / entitlement coverage in demo

| Practice | Plan slug | AI | Automation | Notable override |
|----------|-----------|----|------------|------------------|
| Alice | `standard` | Off | Off | CLIENT_LIMIT = 6 |
| Bob | `pro` | On (quota) | On | — |
| Charlie | `premium` | On (higher) | On | — |

Try Alice AI routes → denied. Bob AI (with `AI_ENABLED` + mock/openai) → allowed.

---

## 8. What data volume looks like (after full reset)

Approximate (full catalog mode):

| Entity | ~Count |
|--------|--------|
| Global catalog foods | ~200+ |
| Practice custom foods | 2+ |
| Starter + practice recipes | ~30+ |
| Users | 16 |
| Client records | 12 (Maya = 2 clients, 1 user) |
| Meal plans | 7 |
| Tracking days (Emma) | ~14 |
| Invoice statuses covered | All 6 |

---

## 9. Full V1 product feature map

What exists in the app (and is represented in demo / tests):

### Platform & auth
- Register / login / logout (cookie `ns_session`)
- Email verification, password reset, invitations
- Platform roles: SUPER_ADMIN, ADMIN
- Marketing guest gate (signed-in users redirected off marketing)
- Admin: users, dietitians, plans, subscriptions, features, food sources, site settings, audit, health

### Practice (dietitian)
- Dashboard
- Clients (portfolio: profile, goals, tags, timeline)
- Foods (catalog search, custom foods, overrides, nutrition calculate)
- Recipes / meal library (starter + practice-owned)
- Meal plans (multi-week, draft/publish, immutable published snapshots)
- Calendar / appointments (schedule, cancel, reschedule propose/accept/reject)
- Messages (REST + WebSocket realtime)
- Notifications (bell, mark read, deep links)
- Documents (upload/list/download, SHARED vs INTERNAL)
- Invoices (draft → issue → send → paid/overdue/cancelled)
- Tasks (priorities, statuses, overdue)
- Analytics (overview, clients, activity, financial)
- Automations + runs
- AI assists (client summary, meal-plan, nutrition, consultation, message draft) — dietitian-side only
- Settings / subscription access state (ACTIVE, GRACE, READ_ONLY, LOCKED)

### Patient portal
- Dashboard
- Active practice switcher (multi-dietitian)
- Meal plan view (published snapshot)
- Tracking (food, water, exercise, sleep, habits, planned meals)
- Progress / evolution (measurements, charts/filters)
- Assessments
- Appointments
- Messages
- Documents
- Invoices
- Notifications
- Profile / join another practice

### Nutrition engine & history
- Shared nutrition calculations
- Published meal-plan snapshots stay frozen after recipe/food changes
- Food log `nutritionSnapshot` stays frozen after food mutation

---

## 10. Frontend routes (where to click)

### Marketing
`/`, `/features`, `/pricing`, `/how-it-works`, `/faq`, `/contact`

### Auth
`/auth/dietitian/login`, `/auth/dietitian/register`, `/auth/client/login`, `/auth/client/register`, forgot/reset/verify/invitation

### Admin
`/admin`, `/admin/dietitians`, `/admin/users`, `/admin/subscriptions`, `/admin/plans`, `/admin/food-sources`, `/admin/features`, `/admin/site-settings`, `/admin/audit`, `/admin/health`

### Practice
`/practice/[dietitianAccountId]/…`  
clients, meal-plans, foods, recipes, habits, calendar, messages, notifications, tasks, documents, invoices, analytics, ai, automations, settings

### Client
`/client`, `/client/plan`, `/client/tracking`, `/client/progress`, `/client/assessments`, `/client/appointments`, `/client/messages`, `/client/notifications`, `/client/documents`, `/client/invoices`, `/client/profile`, `/client/join`

---

## 11. Suggested walkthrough (15–20 minutes)

1. **Admin** `admin@demo.local` → plans Standard/Pro/Premium, see three practices  
2. **Alice** → clients (Harbor tags), foods (Harbor smoothie only), Emma meal plan, calendar, messages, invoices HN-*, try AI (should fail on Standard)  
3. **Bob** → Cedar oat blend, automations list, Noah chat; AI if env enabled  
4. **Emma** `patient.emma@demo.local` → plan, tracking, notifications, invoices (no drafts)  
5. **Maya shared** → switch Harbor ↔ Cedar; confirm meal plan title/data swap  
6. **Charlie** → Premium practice, Ava draft plan, GI-tagged clients  

---

## 12. Demo commands & safety

| Command | Effect |
|---------|--------|
| `DEMO_ALLOW_RESET=1 pnpm demo:reset` | Wipe allowlisted DB + full seed |
| `pnpm demo:seed` | Seed without wipe (prefer reset) |
| `DEMO_ALLOW_RESET=1 pnpm demo:reset -- --sample-catalog` | Smaller food set |

**Safety:** requires `DEMO_ALLOW_RESET=1`, non-production `NODE_ENV`, DB name `nutrition` or `nutrition_demo`. Never wipes `nutrition_test` or production.

Code: `apps/api/src/demo/` (`cli.ts`, `seed-world.ts`, `safety.ts`, `wipe.ts`, `imports.ts`).

---

## 13. Acceptance testing

| Suite folder | Covers |
|--------------|--------|
| `apps/api/test/v1-acceptance/` | Auth, admin/entitlements, isolation, multi-dietitian, food/recipe/meal, tracking/evolution, appointments/messaging, invoices/tasks/analytics/docs, automation, AI mock, snapshots, lifecycle |

Run inside Docker api container:

```bash
docker compose -f docker-compose.dev.yml exec -T api sh -c \
  'cd /app/apps/api && \
   TEST_DATABASE_URL="postgresql://nutrition:nutrition@postgres:5432/nutrition_test?schema=public" \
   REDIS_URL="redis://redis:6379" \
   FILE_STORAGE_PATH="/app/apps/api/storage" \
   pnpm test test/v1-acceptance'
```

Related docs: [TESTING.md](./TESTING.md), [QA.md](./QA.md), [DEMO.md](./DEMO.md).

---

## 13b. Revoke / rejoin portal behavior

- Deactivating a `ClientAccount` does **not** revoke patient sessions.
- Sessions that pointed at the deactivated client switch `activeClientId` to another ACTIVE connection when one exists; otherwise `activeClientId` is cleared and onboarding returns `needs_join`.
- Routing: authenticated + ACTIVE → `/client`; authenticated + no ACTIVE → `/client/join`; unauthenticated → login. `/client/join` stays reachable without a portal↔join redirect loop.
- Resolve supports practice **and** per-client codes (`ok` / `already_connected`). Rejoin reactivates the same row for the same practice; data stays intact and cross-practice isolation is preserved.

E2E: `apps/api/test/revoke-rejoin.e2e.spec.ts`.

**Patient leave request:** portal `POST /api/v1/portal/connections/disconnect-request` sets `ClientAccount.disconnectRequestedAt` and notifies the dietitian (`DISCONNECT_REQUESTED`). Access stays until the practice deactivates (or dismisses / patient cancels). E2E: `apps/api/test/disconnect-request.e2e.spec.ts`.

---

## 14. AI note

- Automated tests use **MockAiProvider** (`AI_PROVIDER=mock`).
- Demo UI AI needs `AI_ENABLED` (and optionally OpenAI) in env; if unset, skip AI screens.
- Seed creates AI usage rows only when `AI_ENABLED=true`.

---

## 15. What was intentionally deferred

- Playwright / browser E2E (not in repo) — use manual checklist in QA.md  
- Real OpenAI / Stripe / production credentials  
- Pointing `demo:reset` at production databases  

---

## 16. Credentials policy

All `@demo.local` accounts are **development-only**. Do not reuse passwords or emails in production. Do not commit real secrets.
