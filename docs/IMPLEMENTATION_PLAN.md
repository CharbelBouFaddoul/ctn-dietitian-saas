# Implementation Plan

**Status:** Phase 13 production hardening implemented  
**Source of truth:** [`Nutrition_SaaS_Master_Specification.md`](../Nutrition_SaaS_Master_Specification.md)  
**Architecture:** [ARCHITECTURE.md](./ARCHITECTURE.md)  
**Database roadmap:** [DATABASE.md](./DATABASE.md)

Do not rewrite the project from scratch. This plan refines the approved 13-phase structure.

**Current repo:** Phase 13 (production hardening) is complete. All 13 phases implemented.

---

## Locked V1 constraints

- Modular monolith (Next.js + NestJS + PostgreSQL + Redis + Docker/Coolify)
- No microservices, Kubernetes, GraphQL, Elasticsearch, payment gateway
- No native mobile app in V1 (API-ready for Stage 2)
- No medical EMR, generic rules engines, or external food API in V1
- One unified subscription (Standard / Pro / Premium); entitlements stay simple
- AI is draft → dietitian review → client
- Tenant isolation is mandatory and backend-enforced
- CLIENT is **not** an `organization_member`

---

## Proposed spec clarifications (not applied to the master spec)

These fill gaps without silently editing `Nutrition_SaaS_Master_Specification.md`:

| Topic | Clarification for V1 |
|---|---|
| Client identity | Client is a `Client` + optional `client_accounts` **link** (not a second auth system, not a member role) |
| Client status | `PENDING` / `ACTIVE` / `INACTIVE` / `ARCHIVED`; inactive/archived remain stored |
| Assignments | `client_assignments` with history; OWNER sees all; DIETITIAN sees assigned |
| Timeline | `timeline_events` references real records; same client-access rules; not an auth bypass |
| Tags | Simple org `tags` + `client_tags` |
| Sleep | Dedicated `sleep_logs` |
| Care Plan | Lightweight nutrition layer (goals, targets, notes, habits, active plan). Not a clinical EMR |
| Practice settings | `organization_settings` including timezone, **locale** (separate), and units |
| Units | Store kg/cm/g/ml/kcal; convert for display; typed `client_measurements` rows |
| Email | `EmailService` in Phase 2; production provider in Phase 9 |
| Food dataset | USDA FoodData Central Foundation Foods (US government work / public domain in the U.S.). Repo ships a format-stable pipeline sample; production can import a larger mapped JSON without changing the importer. |
| Tenant columns | Default `organization_id` on tenant-owned rows even when a parent exists |
| Lifecycle | Archive/retain important business records; expire disposable auth tokens |

---

## Phase 1 — Foundation

**Objective:** Reproducible local platform. No product features.

**Dependencies:** none.

**Database:** Prisma initialized. No domain tables. Baseline migration must **run**, not merely exist.

**Backend:** NestJS HTTP + worker entrypoint; ConfigModule; structured logging; CORS/security-header stubs; `GET /health` (API, Postgres, Redis, storage path); OpenAPI at `/api/docs` (development).

**Frontend:** Next.js App Router placeholders (`/admin`, `/dietitian`, `/client`, `/auth`); design tokens only.

**Security:** secrets via env; `.env` gitignored; OpenAPI not publicly exposed in production config.

**Testing / smoke (required):**

- PostgreSQL starts via Compose
- Prisma connects
- Migration applies successfully on a clean volume
- Prisma client generates
- API connects to the database (`/health` reports db up)
- Worker process starts and connects to Redis (and db if it uses Prisma)

**Definition of done:**

- [x] `pnpm install` works
- [x] `docker compose up` runs web, api, worker, postgres, redis
- [x] From a **clean** environment: migrate + generate succeed
- [x] `GET /health` is healthy (API, PostgreSQL, Redis, storage)
- [x] `GET /api/docs` serves OpenAPI in development
- [x] `pnpm typecheck` and `pnpm lint` pass
- [x] `.env.example` documents every variable
- [x] CI runs typecheck/lint
- [x] This docs set exists (`IMPLEMENTATION_PLAN`, `ARCHITECTURE`, `DATABASE`, plus stubs for API/SECURITY/DEPLOYMENT)

**Out of scope:** users table, login, tenancy, product UI.

---

## Phase 2 — Authentication

**Objective:** Email/password identity, sessions, verification, reset, invitation token primitive, EmailService.

**Dependencies:** Phase 1.

**Database:** `users`, `sessions`, `email_verification_tokens`, `password_reset_tokens`, `invitation_tokens`, `consents`. Platform role on user (`SUPER_ADMIN` \| `ADMIN` \| null). No CLIENT member role.

**Backend:** Argon2id; revocable cookie sessions; rate-limited auth routes; `EmailService` + `ConsoleEmailProvider` (or local mail catcher). Methods: `sendVerification`, `sendPasswordReset`, `sendInvitation`. No vendor SDK in domain code.

**Frontend:** login, register (dietitian self-register → PENDING), forgot/reset password, verify email.

**Security:** no secrets in logs; single-use expiring tokens; session revoke.

**Testing:** auth flows; token reuse rejected; expired tokens rejected; revoked sessions cannot authenticate; rate limit on login/reset.

**DoD:**

- [x] Users, sessions, verification/reset/invitation tokens, consents
- [x] Argon2id; hashed tokens at rest; httpOnly cookies; rate limiting
- [x] Login / logout / `/me` / verify / forgot / reset
- [x] Invitation infrastructure (no client/staff workflow)
- [x] Auth tests, Prisma migration, OpenAPI, typecheck, lint
- [x] No Phase 3 organizations / tenants / clients

---

## Phase 3 — Multi-tenancy

**Objective:** Organizations, staff membership, tenant guards, ClientAccessService contract, org timezone/locale/units defaults.

**Dependencies:** Phase 2.

**Database:** `organizations`, `organization_members` (OWNER, DIETITIAN, STAFF only), `organization_settings` (timezone, **locale**, currency, display units, date format).

**Backend:** Tenant interceptor/guard; permission catalog; `ClientAccessService` interface (full assignment data in Phase 5). No CLIENT in `organization_members`. Tenant-owned rows carry `organization_id` by default.

**Frontend:** minimal org context; no full admin UI yet.

**Security / tests:** Org A cannot read **or modify** Org B. Role/org IDs from the client are ignored.

**DoD:**

- [x] Organizations, settings, members (OWNER / DIETITIAN / STAFF)
- [x] TenantGuard + tenant-scoped queries; multi-org users
- [x] Lifecycle PENDING / ACTIVE / SUSPENDED / ARCHIVED enforced
- [x] Last-OWNER protection and ownership transfer
- [x] Isolation tests, Prisma migration, OpenAPI, typecheck, lint
- [x] No Phase 4 subscriptions / plans / audit table / clients

---

## Phase 4 — Admin

**Objective:** Platform admin for orgs, users, plans, features, overrides, audit.

**Dependencies:** Phase 3.

**Database:** `plans`, `features`, `plan_features`, `subscriptions` (billing columns present, **no payments**), `feature_overrides`, `audit_logs`.

**Backend:** `EntitlementService` (global feature → ACTIVE subscription → org override → plan feature → default deny). One subscription per organization. AI uses the same plan/feature/override path. `SecurityEventLogger` persists `audit_logs`. Impersonation was **not** included in the approved Phase 4 scope and is deferred.

**Frontend:** `/admin` dashboard, organizations (including effective entitlements + overrides), users, plans, features, subscriptions, audit logs. Server-side API authorization; UI also checks `/api/v1/admin/me`.

**Security / tests:** Standard cannot access a Pro-only feature; override enable/disable works **and cannot affect another org**; no subscription / suspended subscription deny; referenced plans cannot be deleted; admin endpoints reject non-platform users; audit sanitizes secrets.

**DoD:**

- [x] Plans, features, plan_features, one subscription per organization
- [x] Subscription lifecycle and organization overrides
- [x] EntitlementService is the only feature gate
- [x] Platform ADMIN / SUPER_ADMIN authorization
- [x] Admin org/user/plan/feature/subscription/override/audit APIs and UI
- [x] SecurityEventLogger persists audit_logs
- [x] AI represented as catalog features, not a separate subscription
- [x] No payment processor
- [x] Security tests + Phase 2/3 tests, Prisma migration, OpenAPI, typecheck, lint
- [x] No Phase 5 clients / food / meals / AI generation

---

## Phase 5 — Dietitian + clients

**Objective:** Practice workspace: clients, assignments, tags, timeline, lightweight Care Plan, assessments, measurements, appointments, practice settings UI, client invitation.

**Dependencies:** Phases 2–4.

**Database:** `clients`, `client_accounts`, `client_assignments`, `client_profiles`, `client_goals`, `client_measurements`, `tags`, `client_tags`, `timeline_events`, `assessment_templates`, `assessments`, `appointments`. Expand `organization_settings`.

**Backend:** Client CRUD/archive (`PENDING`/`ACTIVE`/`INACTIVE`/`ARCHIVED`; no physical delete of history); invitation → EmailService → activate → password on **`users`** → `client_accounts` link; `ClientAccessService` fully enforced including timeline; typed `client_measurements` in internal units; appointments as UTC instants with org timezone; timeline writers on important events.

**Visibility:** OWNER all org clients; DIETITIAN assigned; STAFF via permissions; Client own record only; platform admins per admin authz.

**Frontend:** Dietitian dashboard (“what needs attention today?”), client list/filters/tags, client workspace tabs. Care Plan tab = goals, targets, notes, habits placeholder, active plan placeholder — not a clinical EMR.

**Security / tests:** Dietitian cannot access **or modify** unassigned clients; client cannot access **or modify** another client; timeline cannot bypass client authz; assignment history on reassignment; invitation tokens single-use/expiring; archived/inactive clients cannot regain portal access.

**DoD:**

- [x] clients, profiles, goals, tags, measurements, assessments, appointments, timeline
- [x] client_accounts + invitation/activation (users identity; no second auth system)
- [x] client_assignments with history; ClientAccessService on all client operations including timeline
- [x] OWNER / assigned DIETITIAN / STAFF visibility
- [x] archive retains history; portal deactivated; identity not deleted
- [x] practice settings expansion + dietitian dashboard / client list / client workspace
- [x] EntitlementService `CLIENT_LIMIT`; SecurityEventLogger audit
- [x] Security tests + Phase 2/3/4 tests, Prisma migration, typecheck, lint
- [x] No Phase 6 food / recipes / meal plans / tracking / messaging / invoices / AI generation

---

## Phase 6 — Nutrition engine + food database

**Objective:** Import pipeline, search, overrides, authoritative calculations.

**Dependencies:** Phase 5.

**Database:** `food_sources`, `foods`, `food_overrides`. Migration `20260818020000_foods_nutrition`.

**Backend:** `pnpm food:import`; `FoodService.getEffective`; organization overrides; `packages/nutrition` used by API. No recipes or meal plans.

**Tests:** `apps/api/test/nutrition-engine.spec.ts`, `food-import.spec.ts`, `foods.e2e.spec.ts`.

**DoD:** Search foods; org override changes effective nutrition for that org only; dietitians cannot PATCH global foods.

**Selected dataset:** USDA FoodData Central Foundation Foods. License: United States government work, public domain in the U.S., commercial use permitted. Attribution stored on `food_sources`. Sample file: `apps/api/food-data/usda-foundation-sample.json`.

---

## Phase 7 — Recipes + meal plans

**Objective:** Recipes, meal plan builder, versioning, publish to client, portal meal-plan viewing.

**Dependencies:** Phase 6.

**Database:** `recipes`, `recipe_ingredients`, `meal_plans` (`organization_id` + `client_id`), `meal_plan_versions` (immutable `snapshot` JSON at publish), `meal_plan_days`, `meals`, `meal_items`. Archive rather than hard-delete plans/recipes. Published versions are retained as `PUBLISHED` then `SUPERSEDED`.

**Backend:** `RecipeNutritionService` + `MealPlanService`. Drafts recalculate through `FoodService.getEffective()`. Publish writes a snapshot transactionally and supersedes the previous published version. `ClientAccessService` on every client-sensitive meal-plan operation. Timeline: `MEAL_PLAN_CREATED` / `MEAL_PLAN_PUBLISHED`. No new entitlement feature keys (master spec has permission names, not recipe/meal-plan subscription keys).

**Frontend:** Dietitian `/orgs/:id/recipes` and `/orgs/:id/meal-plans` editor. Client portal `/client/plan` shows the current published snapshot only. PWA web app manifest for installability; no service worker, push, or offline tracking.

**DoD:** Dietitian creates recipes and meal plans; publishing is immutable; historical versions remain; clients see only their current published plan; food/recipe edits do not mutate published snapshots.

---

## Phase 8 — Client tracking

**Objective:** Client food/water/exercise/sleep/habit logging; dietitian review; derived daily summaries.

**Dependencies:** Phases 5, 6, 7.

**Database:** `food_logs` (with `nutrition_snapshot`), `water_logs`, `exercise_logs`, `sleep_logs`, `habit_logs`. Archive rather than hard-delete.

**Backend:** `ClientAccessService` for all client data. Food logs snapshot nutrition via `FoodService.getEffective()`. Organization timezone drives local `tracking_date`. Timeline create events only. Portal food search at `GET /portal/foods`.

**Frontend:** Client `/client/tracking` PWA screen. Dietitian client workspace **Tracking** tab (read-only review).

**DoD:** Client logs daily data; historical food nutrition remains stable after overrides; dietitian reviews assigned clients; tenant and cross-client isolation enforced.

---

## Phase 9 — Messaging + documents + notifications

**Status:** COMPLETE

**Objective:** Conversations, private files, in-app notifications.

**Database:** `conversations`, `messages`, `conversation_read_states`, `documents`, `notifications`.

**Backend:** Extended `StorageService`; authz on every file; magic-byte validation; timeline + audit on key mutations.

**Frontend:** Client `/client/messages`, `/client/documents`. Org inbox + client workspace Messages/Documents tabs.

**DoD:** Dietitian and client message; document upload is private; unauthorized document access denied.

---

## Phase 10 — Invoices + tasks + analytics

**Objective:** Invoices without payments, internal tasks, practice analytics.

**Dependencies:** Phase 5+ (clients, settings), Phase 9 (notifications, email abstraction).

**Database:** Migration `20260818060000_invoices_tasks` — `invoices`, `invoice_items`, `invoice_sequences`, `tasks`.

**Invoice lifecycle:** DRAFT → ISSUED → SENT → PAID | OVERDUE | CANCELLED. No payment processor; dietitian marks paid manually. Issued invoices are immutable; numbering is concurrency-safe per organization (`INV-000001` format).

**Tasks:** Internal to practice (not client-visible). Statuses TODO, IN_PROGRESS, COMPLETED, CANCELLED. Priorities LOW, NORMAL, HIGH, URGENT.

**Analytics:** Server-side aggregates (`/analytics/overview`, `/clients`, `/activity`, `/financial`) with organization timezone date ranges.

**Frontend:** `/orgs/:id/invoices`, `/orgs/:id/tasks`, `/orgs/:id/analytics`, `/client/invoices`, client workspace Invoices tab, dashboard widgets.

**Tests:** `invoices-tasks-analytics.e2e.spec.ts` (3 tests). Total API tests: 76.

**DoD:** Dietitian issues invoice; client views sent invoice; tasks and analytics on dashboard; tenant isolation preserved.

- [x] Phase 10 complete
- [ ] Phase 11 not started

---

## Phase 11 — AI

**Objective:** Dietitian-side AI assistance with provider abstraction, entitlements, and safe structured output.

**Dependencies:** Entitlements (Phase 4), client data (Phases 5–10).

**Database:** Migration `20260818070000_ai` — `ai_requests`, `ai_usage`.

**Entitlements:** Uses existing `AI` + `AI_REQUEST_LIMIT` via `EntitlementService`. No separate AI subscription.

**Features:** Client summary, meal-plan assistance, nutrition assistance, consultation summary, message draft. No client portal AI.

**Provider:** `AiProvider` abstraction with `MockAiProvider` (dev/tests) and `OpenAiProvider` (optional). API keys server-side only.

**Security:** `ClientAccessService` on all client AI routes; serializable transaction for usage limits; zod validation of structured output; no direct record mutations.

**Frontend:** Reusable `AiPanel` on client workspace **AI assist** tab.

**Tests:** `ai.e2e.spec.ts` (6 tests), `ai-output.spec.ts` (2 tests). Total API tests: 84.

**DoD:** Dietitian generates reviewable AI drafts; limits enforced; tenant isolation preserved.

- [x] Phase 11 complete
- [x] Phase 12 complete
- [x] Phase 13 complete

---

## Phase 12 — Automation

**Objective:** Deterministic practice automation via BullMQ — reminders, follow-up tasks, notifications, and email using existing services.

**Database:** `automation_rules`, `automation_runs`, `automation_usage`.

**Entitlements:** `AUTOMATION`, `AUTOMATION_RULE_LIMIT`, `AUTOMATION_EXECUTION_LIMIT` via existing `EntitlementService` (Standard disabled; Pro/Premium enabled with limits).

**Engine:** Scheduled sweep every 5 minutes (`AutomationQueueService` in worker). `AutomationEvaluatorService` finds candidates; `AutomationExecutorService` runs actions through `NotificationService`, `EmailService`, `TaskService.createFromAutomation()`. Idempotency via unique `(organization_id, trigger_key)` on `automation_runs`.

**Triggers (V1):** `APPOINTMENT_UPCOMING`, `APPOINTMENT_MISSED`, `CLIENT_INACTIVE`, `MEAL_PLAN_ENDING`, `INVOICE_OVERDUE`, `TASK_DUE`, `CLIENT_CHECKIN_DUE`, `SCHEDULED_DATE_TIME`.

**Actions (V1):** `SEND_IN_APP_NOTIFICATION`, `SEND_EMAIL`, `CREATE_TASK`, `CREATE_CLIENT_NOTIFICATION`.

**UI:** `/orgs/:id/automations` with guided rule builder and run history.

**Tests:** `automation.e2e.spec.ts` (7 tests), `automation-template.spec.ts` (2 tests). Total API tests: 93.

**DoD:** Rules execute deterministically; tenant isolation and entitlements enforced; no autonomous AI agent; no direct record mutations.

- [x] Phase 12 complete
- [x] Phase 13 complete

---

## Phase 13 — Production hardening

**Objective:** Security, backups, monitoring, Coolify on Hostinger VPS, §87 E2E workflow.

**Dependencies:** Phases 1–12 as implemented.

**Database:** No new migration (remains 12 through `20260818080000_automation`).

**Security:** Extended rate limits (auth, messaging, upload, AI); production env validation (`AUTH_TOKEN_SECRET` placeholder rejected; SMTP required when `EMAIL_PROVIDER=smtp`); `GlobalExceptionFilter` + structured error tracking hook; Swagger disabled in production by default.

**Email:** `SmtpEmailProvider` wired behind `EMAIL_PROVIDER=smtp`; `ConsoleEmailProvider` retained for dev/test.

**Ops scripts:** `scripts/backup.sh`, `restore.sh`, `verify-backup.sh`, `deploy-checklist.sh`.

**Tests:** `security-isolation.spec.ts` (9), `acceptance-workflow.e2e.spec.ts` (1), `production-config.spec.ts` (4); extended `rate-limit.e2e.spec.ts`. Total API tests: **109**.

**CI:** Full test suite with Postgres + Redis; job renamed from “Authentication tests” to “API tests”.

**Docs:** [DEPLOYMENT.md](./DEPLOYMENT.md), [RUNBOOK.md](./RUNBOOK.md), [SECURITY.md](./SECURITY.md) Phase 13 section.

**§87 workflow:** Adapted to existing APIs (dietitian self-registration + admin Pro assignment; no staff invitation workflow).

**DoD:** Staging deploy documented; backup/restore scripts provided; tenant isolation tests green; no public `/api/docs` in production config; full admin → dietitian → client workflow passes in `acceptance-workflow.e2e.spec.ts`.

- [x] Phase 13 complete

## Mandatory security tests (release-blocking)

Automate as the relevant modules land. Full list: [DATABASE.md](./DATABASE.md#mandatory-security-tests-as-modules-land).

Tenant isolation is a **release-blocking** security requirement.

---

## Definition of done (every feature)

From the master spec: UI, API, model, validation, authorization, tenant isolation, errors, loading/empty states, tests, audit where applicable, entitlements where applicable, responsive behavior where applicable.

---

## Remaining product decisions (do not block Phase 1)

1. **Same email, two contexts:** May one person be a dietitian in Org A and a client in Org B? Recommended for later: disallow dual identity on one user until needed.
2. **STAFF default permissions:** Exact grant list for reception vs clinical data.
3. **Who may impersonate:** SUPER_ADMIN only vs SUPER_ADMIN + selected ADMIN.
4. **Per-client timezone:** V1 uses organization timezone; confirm that is acceptable.
5. **BMR/EER formula** (Mifflin-St Jeor vs other) when calculation UI ships (Phase 5/6).
6. **Production email and AI vendors** (interfaces exist first).
7. **Production food dataset volume:** importer and license are selected (USDA FDC Foundation Foods). Import a larger mapped dump before production scale; the sample proves the pipeline.
8. **Messaging transport:** polling vs websocket (Phase 9).
9. **Assessment template ownership:** platform vs practice vs both.
10. **Malware scanning:** hook in architecture vs V1 scanner.

None of these change Phase 1.

---

## Final checklist (this revision)

- [x] Client is not an organization member
- [x] `client_accounts` is a link table only (not a second auth system)
- [x] Client lifecycle PENDING/ACTIVE/INACTIVE/ARCHIVED
- [x] Archive/retain vs expire disposable tokens
- [x] Client assignment model in the plan
- [x] Owner / Dietitian / Staff visibility explicit
- [x] Timeline events represented and must not bypass authz
- [x] Tags represented
- [x] Sleep logs represented
- [x] Practice settings represented
- [x] Timezone represented
- [x] Locale represented (separate from timezone)
- [x] Normalized measurement units + typed `client_measurements`
- [x] Direct `organization_id` on tenant-owned records by default
- [x] Email abstraction starts in authentication
- [x] Development email adapter exists
- [x] Phase 1 includes DB migration smoke testing
- [x] OpenAPI/Swagger included
- [x] Feature entitlement remains simple
- [x] Care Plan explicitly lightweight
- [x] Client invitation flow explicit
- [x] Admin impersonation audited
- [x] Food dataset licensing acknowledged
- [x] Mandatory isolation/security tests listed
- [x] Overall 13-phase order intact
- [x] No payment gateway
- [x] No unnecessary microservices
- [x] No native mobile app in V1
- [x] AI remains controlled and human-reviewed
- [x] Tenant isolation remains mandatory
