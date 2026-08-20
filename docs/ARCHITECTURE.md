# Architecture

**Status:** Phase 11 AI assistance implemented — awaiting approval to start Phase 12  
**Source of truth:** [`Nutrition_SaaS_Master_Specification.md`](../Nutrition_SaaS_Master_Specification.md)  
**Companion docs:** [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md), [DATABASE.md](./DATABASE.md)

This document records architecture decisions for implementation. It does not replace the master specification. Where this document clarifies underspecified product details, those clarifications are listed in [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md#proposed-spec-clarifications-not-applied-to-the-master-spec) and are **not** silently written back into the master spec.

V1 is a **modular monolith**: Next.js web + NestJS REST API + Redis-backed worker + PostgreSQL. No microservices, Kubernetes, GraphQL, Elasticsearch, payment gateway, or native mobile app.

---

## 1. System shape

```text
Admin panel / Dietitian platform / Client PWA
                    │
              apps/web (Next.js)
                    │
              REST /api/v1
                    │
              apps/api (NestJS)
         ┌──────────┼──────────┐
         ▼          ▼          ▼
   PostgreSQL     Redis    StorageService
                    │
                 Worker
              (BullMQ, same codebase)
                    │
              Email / AI providers
```

| Surface | Audience | App |
|---|---|---|
| Platform admin | SUPER_ADMIN, ADMIN | `apps/web` `/admin` |
| Dietitian/practice | Dietitian account owner | `apps/web` `/practice/:dietitianAccountId` (dashboard, clients, foods, recipes, meal plans, settings) |
| Client portal | Client account | `apps/web` `/client` (portal connections via `ClientAccount`) |

Stage 2 native apps consume the same `/api/v1`. Business logic stays in the API.

---

## 2. Identity model

### 2.1 Users vs membership vs clients

A **User** is the only authentication identity (email, password, sessions, tokens).

A user may be linked to **at most one** of:

1. An **organization membership** (practice staff)
2. A **client account link** (portal access to one Client record)

**CLIENT is not an organization member role.** Clients are not employees of the practice.

`client_accounts` is **only** the join between `users` and `clients`. It is not a second authentication system. Passwords, sessions, and credentials live only on `users` / `sessions` / token tables.

```text
users
  ↓
client_accounts     # link only: user_id UNIQUE, client_id UNIQUE, status, activated_at
  ↓
clients             # practice record; organization_id; status PENDING|ACTIVE|INACTIVE|ARCHIVED
```

Platform administrators are users **without** an organization membership for their admin work. They use platform roles:

- `SUPER_ADMIN`
- `ADMIN`

Organization member roles (only these belong in `organization_members.role`):

- `OWNER`
- `DIETITIAN`
- `STAFF`

A Client belongs to an organization through `clients.organization_id`, not through `organization_members`.

Client lifecycle: `PENDING` → `ACTIVE`, or `INACTIVE` / `ARCHIVED`. Inactive/archived clients remain stored and must not regain portal access accidentally.

Staff membership still:

```text
User
 └── OrganizationMember          # OWNER | DIETITIAN | STAFF only
        └── Organization
```

### 2.2 Client invitation / activation

```text
Dietitian/Owner creates Client record
  → invitation token generated (secure, single-use, expiring)
  → EmailService.sendInvitation()
  → client sets password
  → ClientAccount linked to User + Client
  → token invalidated
  → client logs in to their own portal
```

A Client record can exist before a portal account exists. Invitation tokens are never reusable after activation or expiry.

### 2.3 Sessions and authentication (Phase 2)

Authentication is **identity only**. NestJS `AuthModule` answers who the caller is. It does not check organizations, clients, subscriptions, or feature entitlements.

| Primitive | Role |
|---|---|
| `AuthService` | Register / login / logout |
| `PasswordService` | Argon2id hash + verify + policy |
| `SessionService` | Create, validate, revoke sessions |
| `TokenService` | Secure random tokens + HMAC-SHA256 at rest |
| `EmailVerificationService` | Issue / consume / resend |
| `PasswordResetService` | Forgot + reset (revokes all sessions) |
| `InvitationService` | Generic hashed invitation tokens (no client workflow yet) |
| `ConsentService` | Record that a user accepted a policy version |
| `SessionGuard` / `@CurrentUser()` | Attach the authenticated user to the request |

- Argon2id password hashing; plaintext passwords are never stored
- Server-side sessions in PostgreSQL; cookie `ns_session` is httpOnly, `SameSite=Lax`, `Secure` in production
- Raw session/verification/reset/invitation tokens are HMAC-hashed with `AUTH_TOKEN_SECRET` before insert
- Frontend never stores auth tokens in `localStorage` and never supplies trusted role or organization IDs
- User lifecycle: `PENDING` → `ACTIVE` after email verification; `SUSPENDED` / `ARCHIVED` cannot authenticate
- `users.platform_role` is nullable `SUPER_ADMIN` \| `ADMIN` only. Practice access is DietitianAccount ownership, not org roles on `users`.

**Authorization** (what this user may access) is dietitian-account ownership via `DietitianGuard` on `/api/v1/dietitian/:dietitianAccountId`. Portal patients use `ClientAccount` links and never practice membership. See [TENANCY_MIGRATION.md](./TENANCY_MIGRATION.md).

See [SECURITY.md](./SECURITY.md) and [API.md](./API.md).

### 2.4 DietitianAccount tenancy (Phases 1–7 + 2.5)

Runtime tenant root is **`DietitianAccount`** (1:1 with the owning User). There is **no** active Organization / OrganizationMember layer (removed Phase 7; aliases cleaned Phase 2.5).

```text
Authenticated User
       ↓
DietitianAccount ownership (DietitianGuard)
  or ClientAccount + Session.activeClientId (portal)
       ↓
Tenant-scoped queries via dietitianAccountId (tenantWhere)
```

- Platform roles stay on `users` (`SUPER_ADMIN` \| `ADMIN`).
- Self-serve register/practice create is gated by `PlatformSettings.registrationEnabled` (default off); admins provision dietitians.
- Patients may connect to multiple dietitians (isolated `Client` per link); clinical portal ops require a selected `Session.activeClientId` when more than one connection exists.
- Web practice UI is `/practice/:dietitianAccountId`. Practice APIs are `/api/v1/dietitian/:dietitianAccountId` with `DietitianGuard`.
- Subscription access is derived (`ACTIVE` / `GRACE` / `READ_ONLY` / `LOCKED`) from period end + status; `DietitianGuard` enforces mutations vs reads. See [TENANCY_MIGRATION.md](./TENANCY_MIGRATION.md).
- Phase 5 dashboards: `GET …/practice/dashboard` (extended) and `GET /api/v1/portal/dashboard`. In-app notifications reuse `Notification` with practice/portal list, unread-count, mark-one, mark-all-read; shells poll unread. `PlatformSettings.emailNotificationsEnabled` (default off, admin-only) gates product emails only.
- Phase 6 client portfolio: `GET …/clients/:clientId/portfolio` composes identity, profile, latest measurements/BMI, goals, assessment, meal plan, appointment, messages, small recent timeline, and missing/alerts. Portal profile is read-only lightweight fields for the active connection.
- Phase 7 (tenancy remount): canonical tenant key is `dietitianAccountId`. Admin manages accounts at `/api/v1/admin/dietitians`. Portal remains `ClientAccount` + `activeClientId`.
- **Product Phase 7 (portfolio / evolution / assessments):** practice chart adds Evolution (`GET …/evolution` + SVG charts), assessment question editor + `schemaSnapshot`, portal `/assessments` + `/evolution`. Distinct from tenancy Phase 7 above.
- **Product Phase 8 (food + reusable meals):** curated catalog, `Food.dietitianAccountId` custom foods, Recipes as meal library. Distinct from older “Phase 8 tracking” docs.
- **Product Phase 9 (meal plans):** editor composes meals from foods + recipes; live meal/day nutrition via existing snapshot path; portal shows published composition + macros. No new Meal catalog / migration.
---

## 3. Authorization

Authentication, role permissions, subscription entitlement, and feature overrides are **separate**. Being logged in does not grant an action.

### 3.1 Request pipeline

Every protected request:

```text
Authenticated?
→ Organization valid? (when the resource is tenant-owned)
→ Role allowed?
→ ClientAccessService (when the resource is client-owned)
→ Feature enabled? (EntitlementService, when the action is gated)
```

`ClientAccessService` is mandatory for client-sensitive operations (profile, goals, measurements, assessments, appointments, timeline, tags, portal account). OWNER sees all organization clients. DIETITIAN and STAFF see clients with an **active** assignment (`unassigned_at IS NULL`). STAFF may read and manage records on assigned clients but cannot create, archive, assign, or invite. Timeline is an index, not an authorization bypass.

Client portal sessions require `client_accounts.status = ACTIVE` and `clients.status = ACTIVE`. Archived/inactive clients and deactivated accounts cannot authenticate normally. The `users` identity is retained.

`CLIENT_LIMIT` is enforced through `EntitlementService` on client create/restore-to-ACTIVE and practice join (count of `PENDING` + `ACTIVE` clients). Seeded plan limits: standard **25**, pro **100**, premium **300** (admin overrides via `FeatureOverride`). Do not hardcode commercial seat counts in controllers.
→ Usage limit valid? (when applicable)
→ Resource visible to this actor?
→ Execute
```

Frontend hiding is UX only. The backend is authoritative.

### 3.2 Client visibility (mandatory)

| Actor | Visible clients |
|---|---|
| OWNER | All clients in their organization |
| DIETITIAN | Clients assigned to them via `client_assignments` (active) |
| STAFF | Only what explicit permissions grant (not hardcoded in controllers) |
| Client | Only their own Client record |
| SUPER_ADMIN / ADMIN | Platform-level access per admin authorization, fully audited |

Reassignment: a client can be moved from one dietitian to another. Previous assignment rows are closed (`unassigned_at`) so history is retained.

### 3.3 ClientAccessService

Do not scatter `if (role === ...)` checks across controllers.

A centralized service (`ClientAccessService`) answers `assertCanAccess(tenant, clientId, action)` and `visibleWhere(tenant)`. Actions include read, update, archive, assign, invite, create, and manageRecords.

All client-scoped modules (assessments, appointments, goals, measurements, tags, portal accounts, **timeline events**) must go through this service. Meal plans, documents, messages, and invoices will use the same service when those modules exist.

`timeline_events` is a history/index layer, **not** an authorization mechanism and **not** a security bypass. If Dietitian A cannot access Client B, they cannot retrieve Client B’s timeline.

### 3.4 Admin impersonation

Impersonation is **not** a normal login.

Requirements:

- Explicit permission (not granted by merely being ADMIN unless configured)
- Visible banner; easy exit
- Audit log: actor, target, start, end
- Real administrator identity preserved on the session
- All actions attributable to the real administrator (impersonated user recorded as target context)
- No silent impersonation

### 3.5 Platform administration (Phase 4)

Platform roles live on `users.platform_role` (`SUPER_ADMIN` | `ADMIN`). They are **not** organization roles. An organization OWNER cannot call `/api/v1/admin/*` unless they also have a platform role. The client cannot set `platformRole`.

| Role | Capability |
|---|---|
| `ADMIN` | Organizations, users (status), plans, features, subscriptions, overrides, audit |
| `SUPER_ADMIN` | Everything ADMIN can do, plus assigning/clearing `platform_role` |

There is no granular admin permission matrix in V1. Admin routes are protected by `SessionGuard` + `PlatformRolesGuard` on the API. The `/admin` UI also checks `GET /api/v1/admin/me`; hiding links is not authorization.

`SecurityEventLogger.record` writes structured logs **and** persists `audit_logs`. Auth, organization, and admin mutations share that sink. Metadata is sanitized (password/token/secret/hash/cookie keys stripped).

---

## 4. Multi-tenancy

- One organization = one tenant
- Shared PostgreSQL in V1
- **Default:** tenant-owned rows include their own `organization_id` even when a parent already identifies the org (e.g. `meal_plans.organization_id` + `client_id`)
- Every query on tenant data must filter by organization
- Organization A must never read or modify Organization B resources

Skip a redundant `organization_id` only when there is a strong technical reason.

Global (platform-owned) data includes: plans, features, global foods, platform settings, platform audit of admin actions.

---

## 5. Subscriptions and entitlements

One unified subscription per organization. Plans: Standard, Pro, Premium. No separate AI/feature/messaging subscriptions. No payment gateway in V1. Subscription rows still include future billing fields (cycle, provider, external id, dates, payment status).

Keep the model simple. **Do not build a generic rules engine.**

```text
Feature
Plan
PlanFeature
Subscription
OrganizationFeatureOverride
        │
        ▼
EntitlementService
```

`EntitlementService.can(organizationId, featureKey)` / `limit` / `resolve` are the only entitlement checks. Controllers do not read plans or features directly.

Resolution order:

1. Feature must exist and be globally `ACTIVE`. Otherwise `{ enabled: false, limit: null, source: "default" }`. A globally inactive feature cannot be turned on by an organization override. This still runs inside `EntitlementService` (it does not skip subscription checks).
2. Derived subscription access must be **ACTIVE** or **GRACE** (from `SubscriptionLifecycleService`). Missing/pending/suspended/cancelled subscriptions, and READ_ONLY/LOCKED phases, deny gated features. Open-ended ACTIVE (`currentPeriodEnd` null) remains entitled.
3. Organization override, if present. Nullable override fields inherit the other field from the plan (`enabled` and/or `limit_value`).
4. Plan feature for the subscribed plan (`enabled` + optional `limit_value`).
5. Default deny / unavailable.

Result shape: `{ enabled, limit, source: "override" | "plan" | "default" }`.

AI is a normal catalog feature (`AI` boolean + `AI_REQUEST_LIMIT`). Phase 11 consumes these entitlements via `EntitlementService` — no separate AI subscription.

V1 has **no payment processor**. Admins assign plans manually. Subscription rows include unused billing metadata (`billing_cycle`, `provider`, `external_id`, `payment_status`, period dates) so a future processor can attach without redesigning entitlements.

Impersonation is **not** implemented in Phase 4. When it lands, it remains an explicit, audited, bannered action that preserves the real administrator identity.

Automation rules are a **separate** Phase 12 subsystem, not part of entitlements.

---

## 6. Timezone and locale

Server timezone is **not** the business timezone. **Locale is separate from timezone.**

- Persist timestamps as UTC (`timestamptz`)
- Each organization has an IANA timezone (e.g. `Asia/Beirut`) in practice settings
- Each organization has a `locale` (e.g. `en-LB`, `fr-LB`, `ar-LB`) for number/date formatting, emails, invoices, PDFs, and localization
- Appointments, reminders, notifications, and date-based automations interpret “local day/time” in the organization timezone unless a more specific context exists
- Convert to the viewer’s display timezone at the API/UI boundary
- The same UTC + IANA + locale rules apply to a future native app

V1 default: client-facing dates use the **organization** timezone. A per-client timezone is optional later if product requires it.

---

## 7. Measurement units

Authoritative storage uses **normalized internal units**. Convert only for input/display according to organization (and later client) preferences.

| Domain | Internal unit | Display examples |
|---|---|---|
| Weight | kg | kg, lb |
| Height | cm | cm, in |
| Food mass | g | g, oz |
| Volume | ml | ml, fl oz |
| Energy | kcal | kcal |

Do not persist the same measurement in whatever unit the current UI happens to show.

`client_measurements` is a **single typed table** (`type`, `value`, `unit`, `measured_at`, …), not a new table per measurement and not a generic medical framework. Types include weight, height, waist, body fat, muscle mass, and similar nutrition-practice metrics.

Conversion helpers live in `packages/nutrition` / `packages/utilities` and are used by the **API**. The frontend is not the source of truth for stored values.

---

## 8. Nutrition and food data

Runtime search is **PostgreSQL only**. Production does not call a third-party food API.

```text
Global dataset
    ↓
food_sources
    ↓
foods
    ↓
server-side search / food detail
    ↓
organization food_overrides (nullable fields)
    ↓
FoodService.getEffective / getEffectiveMany
    ↓
packages/nutrition calculateFoodNutrition
```

### Dataset

V1 import source is **USDA FoodData Central Foundation Foods** (US government work; public domain in the U.S.; commercial use permitted). Attribution is stored on `food_sources`. This repository does not claim USDA endorsement.

- Pipeline sample: `apps/api/food-data/usda-foundation-sample.json` (format-stable; used by import unit tests).
- Curated catalog (hundreds of common ACTIVE foods): `apps/api/food-data/usda-foundation-curated.json`.

Import (existing importer only):

```bash
pnpm food:import --file=apps/api/food-data/usda-foundation-curated.json
```

Platform admin may also run `POST /api/v1/admin/food-sources/import` (bundled curated file; no remote URL fetch). Idempotent upsert on `(food_source_id, source_food_id)`. Duplicate IDs in one file: first wins, later rows skipped. Similar names are never merged.

### Ownership (Product Phase 8)

```text
Food.dietitianAccountId = null     → global catalog
Food.dietitianAccountId = <uuid>   → practice-private custom food
```

Custom foods use FoodSource key `practice-custom` with `sourceFoodId = UUID`. Patients and other practices never receive another practice’s customs. Portal food search is `catalogOnly`.

### Overrides

Practice-scoped (`dietitianAccountId`) on **catalog** foods only. Custom foods do not use FoodOverride — their nutrients are on the Food row.

```text
catalog: global food → FoodOverride (ACTIVE) → effective food
custom:  Food row nutrients → effective food
```

Dietitian `PATCH /foods/:id` updates **custom** foods only. Global catalog mutation remains import-only. OWNER/DIETITIAN may create/update/deactivate `food_overrides` on catalog foods.

### Engine

Pure logic lives in `packages/nutrition` (no Prisma). Calculations use g / ml / kcal. Serving text is display-only. Missing nutrients stay `null`; `0` means zero. Round only at API/presentation (`NUTRITION_ROUNDING`). Atwater `P×4 + C×4 + F×9` flags gaps > 25% relative; source kcal is never overwritten. `FoodService.calculate` remains the API entry point.

### Search

Server-side `ILIKE` / `contains` on `name` / `name_normalized` (prefix preferred over contains), plus category, source, and `origin` (`catalog` | `custom` | `all`) filters. Pagination max page size 50. No Elasticsearch.

### Entitlements

The master spec does not define a food-database feature key. Phase 6 does **not** invent `FOOD_DATABASE`. `EntitlementService` remains the only gate for existing keys (`AI`, `CLIENT_LIMIT`, …).

### Recipes as reusable meal database (Product Phase 8)

Historical docs called “Phase 7 — Recipes + meal plans.” **Product Phase 8** treats existing `Recipe` as the reusable meal / meal library. There is **no** MealCatalog / ReusableMeal / SavedMeal table. `Meal` inside a MealPlan remains a plan-day structure only.

```text
FoodService.getEffective()
        ↓
packages/nutrition (calculateFoodNutrition, scaleNutrition, sumNutrition)
        ↓
RecipeNutritionService.calculate()
        ↓
MealPlanService.calculateLive()   # drafts only
        ↓
meal_plan_versions.snapshot       # written once at publish
```

There is **one** calculation path. Controllers and React do not reimplement food lookup, override resolution, calories, macros, unit conversion, or rounding.

**Recipes** belong to a `DietitianAccount` (`ACTIVE` / `ARCHIVED`). Ingredient quantities are whole-recipe mass/volume amounts. Ingredients may reference global catalog foods or this practice’s custom foods only. Total = sum of ingredients (`null` stays `null`; empty recipe is known zero). Per serving = total / `servings`. Meal items use `unit = serving`; `quantity` is the number of servings (`perServing × quantity`).

**Meal plans** belong to dietitian account + client. Plan status (`DRAFT` / `ACTIVE` / `ARCHIVED`) is not version publication status. Versions: `DRAFT` → `PUBLISHED`; the previous published version becomes `SUPERSEDED` and is retained. Publishing is transactional: validate, write snapshot, supersede, mark published, set plan `ACTIVE`.

### Meal composition (Product Phase 9)

```text
Food = individual ingredient (catalog or practice custom)
Recipe = reusable meal composition (meal library)
Meal = concrete meal inside a meal-plan day (Breakfast, Lunch, …)
```

`MealItem` is either `FOOD` (mass/volume quantity) or `RECIPE` (`unit = serving`). Meal nutrition = sum of item nutrition; day nutrition = sum of meals. Draft GETs recalculate live via `FoodService` + `RecipeNutritionService` + `packages/nutrition`. Published versions return the frozen `snapshot` (includes item/meal/day `nutrition` + `presented`). Food payloads in the snapshot include `origin` (`catalog` | `custom`).

Meal items may only reference global ACTIVE foods, the current practice’s custom foods, or the current practice’s ACTIVE recipes. No separate reusable Meal catalog table.

**Authorization:** recipes are tenant-scoped via `DietitianGuard`. Meal plans use `ClientAccessService` (`read` / `manageRecords`). Portal `GET /api/v1/portal/meal-plan` returns only that client’s current `PUBLISHED` snapshot. Clients never see private recipe libraries, drafts, superseded versions, or other clients.

**Migration:** none for Product Phase 9 (schema already supports FOOD/RECIPE items + snapshot).

**Nutrition targets:** reuse Phase 5 `client_goals`. No separate target table.

**Entitlements:** no `RECIPES` / `MEAL_PLANS` feature key is defined in the master spec; none was invented.

### Client tracking (historical Phase 8 in older docs)

Product Phase 8 in this codebase is food/custom foods/recipes-as-meals (above). Older “Phase 8 — Client tracking” content refers to food/water/exercise logs:

```text
Client portal / dietitian review
        ↓
ClientAccessService (portal assertPortalAccess / member assertCanAccess read)
        ↓
food_logs.nutrition_snapshot (immutable history at log time)
water_logs.amount_ml
exercise_logs / sleep_logs / habit_logs
        ↓
TrackingSummaryService (derived daily totals)
```

**Food logs:** independent of meal plans. At create/edit, nutrition is calculated through `FoodService.getEffective()` and stored in `nutrition_snapshot`. Daily food totals sum snapshots — never live food rows. Editing recalculates using current effective food at edit time only for that log.

**Water:** stored as `amount_ml`. Input accepts `ml` or `l`.

**Sleep:** one active row per client/local `date`. Duration derived from `bedtime` → `wake_time` when both provided (supports overnight spans).

**Habits:** `habit_logs` only — no separate habit catalog. `client_goals` remains the nutrition-target layer; habit keys are client-entered/simple defaults in the UI.

**Dietitian access:** read-only review APIs under `/clients/:clientId/tracking`. Clients mutate via `/portal/tracking`. Timeline records create events (`FOOD_LOGGED`, `WATER_LOGGED`, …), not every edit.

**Timezone:** organization `timezone` maps event timestamps to local `tracking_date` / `log_date` / sleep `date`.

### Messaging and documents (Phase 9)

```text
Client portal / org member
        ↓
ClientAccessService
        ↓
conversations → messages (+ conversation_read_states)
documents (storage_key on persistent volume via StorageService)
notifications (in-app)
```

**Messaging:** one conversation per client per `DietitianAccount`. **REST is the source of truth** for creating/listing/marking messages. **Socket.IO** (`/realtime` namespace) is the realtime transport only: after a message persists, the API emits `message.created` / `conversation.updated` / `message.read` / `unread_count.updated` into server-authorized rooms (`conversation:{id}`, `user:{userId}`). Handshake authenticates via the same `ns_session` cookie; clients subscribe with `{ clientId }` and the server resolves the conversation (never trusts client-supplied `conversationId` / `dietitianAccountId`). Patient sockets are scoped to `Session.activeClientId`. Redis adapter reuses `REDIS_URL` for multi-instance fan-out. Messages immutable in V1. Unread via per-user read cursors.

**Appointments:** owned by `DietitianAccount` + `clientId`. Statuses `SCHEDULED` / `RESCHEDULE_PENDING` / `CANCELLED` / `COMPLETED` / `NO_SHOW`; category enum for calendar coloring. Reschedule stores `proposedStartAt` / `proposedEndAt` / `proposedByUserId` until the non-proposer accepts or rejects. Practice calendar is month/week/day over `GET …/appointments?from=&to=`. Portal lists under `/api/v1/portal/appointments` scoped by `activeClientId`. Overlap blocked for the same dietitian on blocking statuses. **REST + NotificationService** only — no appointment WebSocket channel.

**Documents:** binary on `FILE_STORAGE_PATH`; metadata in PostgreSQL. Authenticated download only — no public URLs. Visibility `INTERNAL` (staff only) or `SHARED` (client + staff). Magic-byte validation; `MAX_DOCUMENT_BYTES` configurable.

**Notifications:** in-app via `Notification` (Phase 5 extended types + mark-all-read). Shells poll unread-count. Product emails (invoice, automation) gated by `emailNotificationsEnabled` (default off); auth emails always send.

---

## 9. Care Plan (V1)

The Client Workspace includes a Care Plan tab. V1 does **not** implement a clinical care-management EMR.

Care Plan is a lightweight nutrition-management view over:

- client goals
- nutrition targets (calories/macros, dietitian-overridable)
- recommendations / relevant notes
- habits
- reference to the active meal plan

No separate giant `care_plans` clinical engine in V1.

---

## 10. Email

`EmailService` is introduced in **Phase 2** (authentication). Application code never imports a vendor SDK directly.

Phase 2 methods:

- `sendVerification()`
- `sendPasswordReset()`
- `sendInvitation()`

Phase 2 adapter: `ConsoleEmailProvider` (logs to the API console; raw tokens appear there in development only). Phase 9 swaps in a production provider. Additional methods (reminders, invoices, message notifications) are added when those features land, still through `EmailService`.

---

## 11. Files and jobs

- `StorageService` + `FILE_STORAGE_PATH` (default `/data/storage` in Coolify)
- Files private by default; access requires auth + authorization
- Worker: BullMQ on Redis; second process entrypoint in `apps/api` (`worker.ts`)
- Slow work (email, PDF, images, AI, exports) must not block HTTP

---

## 12. AI

Provider behind `AiProvider`. Gated by global settings + plan + override + usage limits. Output is a **draft**. Dietitian review/edit/approve is required before a client sees clinical/nutrition recommendations. AI must not directly mutate important clinical records.

---

## 13. API and OpenAPI

- REST base path: `/api/v1`
- Health: `GET /health` (API, PostgreSQL, Redis, storage)
- OpenAPI/Swagger at `/api/docs` in development
- Production docs are not publicly exposed unless explicitly enabled

---

## 14. Repository layout

```text
apps/web/          Next.js App Router
apps/api/          NestJS + Prisma + worker entrypoint
packages/ui
packages/types
packages/validation
packages/nutrition
packages/config
packages/utilities
docs/
scripts/
docker/
```

Tooling: pnpm workspaces + Turborepo. Prisma lives in `apps/api`. Schema grows **per phase** (see [DATABASE.md](./DATABASE.md)).

---

## 15. Practice settings

`organization_settings` (1:1 with organization) holds practice name/logo, contact, **timezone**, **locale** (separate), currency, date format, measurement units, default appointment duration, reminder preferences, invoice settings, and email branding.

Settings are consumed by invoices, emails, PDFs, appointments, client portal, and branding. Phase 10 invoice modules read `currency`, `invoiceDefaultDueDays`, and `invoiceFooter` from settings.

---

## 15a. Phase 10 — Invoices, tasks, analytics

**Modules:** `InvoicesModule`, `TasksModule`, `AnalyticsModule` (extends `PracticeModule` dashboard).

**Invoices:** Server-side decimal totals; `InvoiceNumberService` uses PostgreSQL upsert on `invoice_sequences` for concurrency-safe numbering. Portal exposes read-only invoices (ISSUED/SENT/PAID/OVERDUE). No Stripe or payment webhooks.

**Tasks:** Organization-scoped; optional client link. `ClientAccessService` gates client-related tasks. Not exposed on client portal.

**Analytics:** `AnalyticsService` runs SQL aggregates with `resolveAnalyticsRange()` (organization timezone). “Needs attention” uses transparent operational reasons (e.g. days since last tracking), not clinical scores.

---

## 15b. Phase 11 — AI assistance

**Module:** `AiModule` (`AiService`, `AiContextService`, `AiUsageService`, `AiProvider`).

**Flow:** Controller → `AiService` → `EntitlementService` → atomic usage reservation → `AiContextService` → prompt builder → `AiProvider` → zod validation → `ai_requests` persistence.

**Providers:** `MockAiProvider` (default, no API key) and `OpenAiProvider` (when `AI_PROVIDER=openai` and `AI_API_KEY` set).

**Privacy:** Context builder sends minimal client data only; no passwords, tokens, or storage keys. Prompts/responses are not stored long-term.

**Safety:** Structured JSON output validated before return. AI never mutates clients, meal plans, messages, invoices, or tracking data. Client portal has no AI routes.

---

## 15c. Phase 12 — Automation

**Module:** `AutomationModule` (`AutomationService`, `AutomationEvaluatorService`, `AutomationExecutorService`, `AutomationSweepService`, `AutomationQueueService` in worker).

**Flow:** Worker sweep → evaluate active rules (org timezone) → reserve execution limit → idempotent run row → validate client/org state → template render → existing service action.

**Safety:** No arbitrary code in rules; template variables from controlled catalog; actions never mutate meal plans, messages, or invoices directly. `CREATE_TASK` uses `TaskService.createFromAutomation()`.

---

## 15d. Phase 13 — Production hardening

**Modules:** `AppThrottlerModule` (global named throttlers), `CommonModule` (`ErrorTrackingService`, `GlobalExceptionFilter`), `SmtpEmailProvider`.

**Email:** `EMAIL_PROVIDER=console|smtp` selects provider behind existing `EmailService`.

**Ops:** `scripts/backup.sh`, `restore.sh`, `verify-backup.sh`, `deploy-checklist.sh`. See [DEPLOYMENT.md](./DEPLOYMENT.md) and [RUNBOOK.md](./RUNBOOK.md).

**Tests:** Consolidated isolation (`security-isolation.spec.ts`), §87 workflow (`acceptance-workflow.e2e.spec.ts`), production config (`production-config.spec.ts`). Total: 109 API tests.

---

## 16. Security baseline

- Tenant isolation on every tenant query (release-blocking)
- Input validation (shared `packages/validation` + Nest pipes)
- Rate limiting on auth, reset, upload, messaging, AI (Phase 13: named throttlers with env limits) (Phase 13: named throttlers with env limits)
- Structured logs without passwords, tokens, secrets, or unnecessary clinical data
- CORS, security headers, HTTPS-ready cookies
- Audit log for security-sensitive and clinical-adjacent actions; impersonation preserves the real actor
- Timeline queries use the same client-access rules as the underlying client
- Archived/inactive clients cannot authenticate to the portal
- Important business records archive/retain; disposable auth tokens may expire/delete

Mandatory automated tests as modules land: see [DATABASE.md](./DATABASE.md#mandatory-security-tests-as-modules-land) (org isolation read/write, assignment, client isolation, timeline, overrides, tokens, sessions, archived portal access, impersonation audit).
