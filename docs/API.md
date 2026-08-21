# API

> **Tenancy (current):** Practice APIs live under `/api/v1/dietitian/:dietitianAccountId` with `DietitianGuard`. There is no active `/api/v1/organizations/*` practice API. See [TENANCY_MIGRATION.md](./TENANCY_MIGRATION.md). Sections below that still document Organization membership routes are historical and not live.

**Status:** Phase 13 production hardening implemented  
**Base URL:** `/api/v1`  
**OpenAPI (development):** `/api/docs`

Health remains outside the versioned prefix. Authentication uses httpOnly cookies, not bearer tokens in localStorage.

Cookie name: `ns_session`. Send `credentials: include` from the web app. OpenAPI documents the cookie via `addCookieAuth`.

## Infrastructure

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | Public | API, PostgreSQL, Redis, and storage probes |
| GET | `/api/docs` | Development only | OpenAPI/Swagger UI |

`GET /health` returns `200` when all checks are `up`, otherwise `503`.

OpenAPI is enabled in development by default and **disabled in production** unless `SWAGGER_ENABLED=true`.

## Authentication (`/api/v1/auth`)

All auth JSON endpoints use request DTOs validated by Nest `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`). Validation failures return `400` with `{ statusCode, message: string[], error: "Bad Request" }`. Sensitive routes are rate-limited (default 10 requests / 60s / IP, configurable). Exceeding the limit returns `429`.

Generic messages are intentional. Login, register, forgot-password, and resend-verification do **not** reveal whether an email exists.

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/auth/register` | Public | Create a `PENDING` identity and send verification email. Always returns the same generic message. Does not create organizations or clients. |
| POST | `/api/v1/auth/login` | Public | Verify password; set `ns_session` cookie on success. Failures always return `401` `"Invalid email or password"`. |
| POST | `/api/v1/auth/logout` | Cookie optional | Revoke the current session if present; always clear the cookie. |
| GET | `/api/v1/auth/me` | Session cookie | Current user + session metadata. `401` if missing/revoked/expired. |
| POST | `/api/v1/auth/verify-email` | Public | Consume a single-use verification token. |
| POST | `/api/v1/auth/resend-verification` | Public | Generic response; sends mail only when verification is still needed. |
| POST | `/api/v1/auth/forgot-password` | Public | Generic response; sends a reset email only when an eligible account exists. |
| POST | `/api/v1/auth/reset-password` | Public | Consume reset token, set new Argon2id hash, revoke all sessions. |
| POST | `/api/v1/auth/sessions/revoke-all` | Session cookie | Revoke every session for the current user and clear the cookie. |

Invitation token infrastructure is `InvitationService` (hashed, expiring, single-use). Phase 5 consumes `CLIENT_INVITE` for portal activation. There is still no staff invitation workflow.

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/auth/invitations/preview` | Public | Validate a client invitation without consuming it |
| POST | `/api/v1/auth/invitations/accept` | Public | Set password on the `users` identity, activate `client_accounts`. Does not create organization membership |

### Request bodies

**POST `/api/v1/auth/register`**

```json
{
  "email": "user@example.com",
  "password": "ValidPass12",
  "consents": [
    { "type": "TERMS_OF_SERVICE", "policyVersion": "1.0" }
  ]
}
```

`consents` is optional. Password policy: configurable minimum length (default 10), maximum 128, at least one letter and one number.

**POST `/api/v1/auth/login`**

```json
{ "email": "user@example.com", "password": "ValidPass12" }
```

**POST `/api/v1/auth/verify-email`**

```json
{ "token": "<raw token from email>" }
```

**POST `/api/v1/auth/resend-verification`** / **POST `/api/v1/auth/forgot-password`**

```json
{ "email": "user@example.com" }
```

**POST `/api/v1/auth/reset-password`**

```json
{ "token": "<raw token from email>", "password": "OtherPass34" }
```

### Responses

Register / logout / verify / resend / forgot / reset:

```json
{ "message": "…" }
```

**GET `/api/v1/auth/me`**

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "status": "ACTIVE",
    "platformRole": null,
    "emailVerifiedAt": "2026-08-17T00:00:00.000Z",
    "createdAt": "2026-08-17T00:00:00.000Z"
  },
  "session": {
    "id": "uuid",
    "createdAt": "2026-08-17T00:00:00.000Z",
    "expiresAt": "2026-08-24T00:00:00.000Z",
    "lastUsedAt": "2026-08-17T00:00:00.000Z"
  }
}
```

`platformRole` is `SUPER_ADMIN`, `ADMIN`, or `null`. Organization roles are not returned from `/auth/me` because they are not on `users`.

## Organizations (`/api/v1/organizations`)

Tenant context is the **route** `organizationId` plus the session cookie. The client cannot send a trusted `role` or `organizationId` in the body. Extra properties are rejected (`400`).

All `/:organizationId` routes require an **active membership** and an **ACTIVE** organization. Missing membership, guessed UUIDs, and other tenants return `403` `"Organization access denied"`. Non-operable orgs return `403` `"This organization is not available"`.

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/organizations` | Session | Create organization + settings. Creator becomes `OWNER`. Status `ACTIVE`. |
| GET | `/api/v1/organizations` | Session | List the current user's **active** memberships. |
| GET | `/api/v1/organizations/:organizationId` | Session + tenant | Organization + tenant context (`role`, `membershipId`). |
| PATCH | `/api/v1/organizations/:organizationId` | OWNER | Update name. |
| GET | `/api/v1/organizations/:organizationId/settings` | Member | Read settings (timezone/locale/units plus practice contact, appointment, reminder, invoice, and email branding fields). |
| PATCH | `/api/v1/organizations/:organizationId/settings` | OWNER | Update those settings. Invoice fields are stored only; there is no invoice system yet. |
| GET | `/api/v1/organizations/:organizationId/members` | Member | List members. |
| POST | `/api/v1/organizations/:organizationId/members` | OWNER | Add existing user as `DIETITIAN` or `STAFF`. |
| PATCH | `/api/v1/organizations/:organizationId/members/:membershipId` | OWNER | Change role. Cannot remove the last OWNER. |
| POST | `/api/v1/organizations/:organizationId/members/:membershipId/deactivate` | OWNER | Deactivate membership. Cannot deactivate the last OWNER. |
| POST | `/api/v1/organizations/:organizationId/transfer-ownership` | OWNER | Target becomes OWNER; caller becomes DIETITIAN. |
| POST | `/api/v1/organizations/:organizationId/archive` | OWNER | Archive (retain data). |

**POST `/api/v1/organizations`**

```json
{
  "name": "North Clinic",
  "settings": {
    "timezone": "UTC",
    "locale": "en",
    "currency": "USD",
    "weightUnit": "kg",
    "heightUnit": "cm",
    "dateFormat": "YYYY_MM_DD"
  }
}
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) and [SECURITY.md](./SECURITY.md).

**GET `/api/v1/organizations/:organizationId/entitlements`**

Session + tenant. Read-only effective entitlements (`enabled`, `limit`, `source`). Does not expose override reasons. The backend is authoritative; there is no client write path for entitlements.

## Practice / clients (`/api/v1/organizations/:organizationId/...`)

Session + `TenantGuard`. Client-scoped routes also run `ClientAccessGuard` / `ClientAccessService`. Server-side list filtering is mandatory. Clients are **not** organization members.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/practice/dashboard` | Owner (`DietitianGuard`) | Aggregated practice home: `clientCount`, `clientLimit`, `unreadMessageCount`, appointments (`endAt`/`status`), messages, notifications, needsAttention, recentlyActive |
| GET | `/clients/:clientId/portfolio` | Client access | Chart overview aggregate: vitals, `previousWeight`, goals, meal plan, appointment, portal `connectionStatus`, timeline |
| GET/POST | `/clients` | Member; create OWNER/DIETITIAN | List (search/status/tag/assignee/page) / create chart-only Client (no User/ClientAccount). Portal invite is a separate join-code step |
| GET/PATCH | `/clients/:clientId` | Client access | Read / update identity |
| POST | `/clients/:clientId/archive` | OWNER/DIETITIAN assigned | Archive; close assignments; deactivate portal; revoke sessions |
| POST | `/clients/:clientId/restore` | OWNER/DIETITIAN assigned | Restore to ACTIVE/INACTIVE without duplicating identity |
| GET/POST | `/clients/:clientId/assignments` | Read / assign | History retained; reassignment closes the previous row |
| GET/POST | `/clients/:clientId/account` `.../join-code` `.../deactivate` `.../disconnect-request/dismiss` | Read / invite | Portal link only; passwords never returned. Chart remains manageable when portal is not activated or deactivated |
| GET/PATCH | `/clients/:clientId/profile` | Read / update | Extended practice profile (dietitian-managed without portal login) |
| GET/POST | `/clients/:clientId/goals` | Read / manageRecords | Lightweight care-plan goals |
| POST | `/clients/:clientId/goals/:goalId/complete` or `/cancel` | manageRecords | Goal lifecycle |
| GET/POST | `/clients/:clientId/measurements` | Read / manageRecords | Typed rows; stored in kg/cm/%; optional `type`, `from`, `to` filters on GET. Practice writes feed Evolution |
| GET | `/clients/:clientId/evolution` | Read | Measurement series, BMI series, baseline/current comparison, date range |
| GET | `/clients/:clientId/timeline` | Read | Organization-scoped **and** client-access scoped |
| GET/POST | `/tags` | DietitianGuard | Clinic tag library (create) |
| PATCH/DELETE | `/tags/:tagId` | DietitianGuard | Rename/update color or delete a clinic tag (cascade removes assignments) |
| PUT | `/clients/:clientId/tags` | update | Replace client tags (clinic-scoped tag IDs only) |
| GET/POST/PATCH | `/assessment-templates` | Owner (DietitianGuard) | Practice-scoped evaluation forms; schema edits bump `version`. Question helpers: `POST …/questions`, `…/questions/reorder`, `…/questions/:id/deactivate` |
| GET | `/assessment-templates/:templateId` | Owner | Template with parsed schema contract |
| GET/POST | `/clients/:clientId/assessments` | Read / manageRecords | Start creates `IN_PROGRESS` assessment and freezes `templateVersion` + `schemaSnapshot` |
| GET/PATCH/POST complete | `/clients/:clientId/assessments/:assessmentId` | Read / manageRecords | GET renders from snapshot; PATCH saves draft answers; complete submits. `COMPLETED`/`ARCHIVED` cannot be rewritten |

**Assessment statuses (`AssessmentStatus`):** `DRAFT` | `IN_PROGRESS` | `COMPLETED` | `ARCHIVED`. Runtime start uses `IN_PROGRESS`; portal/UI “Submitted” maps to `COMPLETED`.

**Answer validation:** PATCH (save) validates types/options for present values; missing required is allowed. POST complete requires all required active questions and rejects invalid NUMBER / BOOLEAN / choice values against the **snapshot** (not the live template).
| GET | `/appointments?from=&to=` | Member | Calendar range (UTC). Omitting range defaults to upcoming-friendly window. Includes client summary; excludes `CANCELLED` |
| GET | `/appointments/:appointmentId` | Member | Appointment detail (incl. category + pending proposal fields) |
| PATCH | `/appointments/:appointmentId` | manageRecords | Edit title/category/notes/times/client while `SCHEDULED`; blocked while `RESCHEDULE_PENDING` |
| POST | `/appointments/:appointmentId/cancel` | manageRecords | Cancel (`CANCELLED`); clears pending proposal |
| POST | `/appointments/:appointmentId/propose-reschedule` | manageRecords | Body `{ startAt, endAt }` → `RESCHEDULE_PENDING` |
| POST | `/appointments/:appointmentId/accept-reschedule` | manageRecords | Non-proposer only; applies proposed times → `SCHEDULED` |
| POST | `/appointments/:appointmentId/reject-reschedule` | manageRecords | Non-proposer only; discards proposal → `SCHEDULED` |
| GET/POST/PATCH | `/clients/:clientId/appointments` | Read / manageRecords | Per-client list/create; status PATCH (`SCHEDULED`/`COMPLETED`/`CANCELLED`/`NO_SHOW`). Create accepts `category` |
| GET | `/foods` | Member | Server-side search (`q`, `category`, `sourceId`, `origin=catalog\|custom\|all`, `page`, `pageSize` ≤ 50). Returns catalog + own custom foods. Each item has `origin` and `hasOverride` |
| GET | `/foods/categories` | Member | Distinct active categories (catalog + own customs) |
| POST | `/foods` | OWNER/DIETITIAN | Create practice-private custom food (`dietitianAccountId` = tenant; never global) |
| GET | `/foods/:foodId` | Member | Effective food. Catalog: global + FoodOverride. Custom: own nutrients. Other practices’ customs → 404 |
| PATCH | `/foods/:foodId` | OWNER/DIETITIAN | Update own custom food only. Global catalog → 404 |
| POST | `/foods/:foodId/archive` | OWNER/DIETITIAN | Soft-archive custom food (`INACTIVE`) |
| POST | `/foods/:foodId/calculate` | Member | `{ quantity, unit }` via `packages/nutrition`; returns raw + `presented` |
| GET | `/foods/:foodId/override` | Member | This practice’s active override on a **catalog** food, or 404 |
| PUT | `/foods/:foodId/override` | OWNER/DIETITIAN | Create/update nullable nutrient overrides on catalog foods only |
| DELETE | `/foods/:foodId/override` | OWNER/DIETITIAN | Deactivate override; effective values return to global |
| GET | `/food-sources` | Member | Active datasets (version, attribution, food count) |

Global catalog foods are never mutated by dietitian `PATCH`. Import via `pnpm food:import` (runs `tsx src/foods/import/cli.ts` — avoids Nest wiping Docker-mounted `dist`) or platform admin `POST /api/v1/admin/food-sources/import` (bundled curated dataset; no remote URL fetch). Prefer host import when `DATABASE_URL` points at Postgres, or `docker compose -f docker-compose.dev.yml exec api pnpm food:import` when using the dev stack.

Platform **Starter recipes** (`dietitianAccountId` null) are imported with `pnpm recipe:import` from `apps/api/recipe-data/myplate-kitchen-starter.json` after foods are imported. Practices can list/use Starters in meal plans but cannot edit/archive them. Practice recipes remain practice-owned.

Meal-plan **weeks** are presentation-only: `dayNumber` stays global; `POST .../versions/:versionId/weeks` appends 7 days. Labels use `Week N · Day D` in `NUMBERED` mode.

**Product Phase 8:** `Food.dietitianAccountId` — `null` = global catalog; non-null = practice custom. Recipes remain the reusable meal database (no separate Meal catalog table). `Meal` inside meal plans is still a plan-day structure only. Meal-plan editor/publish redesign is Phase 9.

Calculate units: mass foods `g` / `kg` / `oz` / `lb`; volume foods `ml` / `l` / `fl_oz`. Presentation rounding: kcal and sodium 0 decimals; macros 1 decimal. Engine math is unrounded.

### Recipes (`/api/v1/dietitian/:dietitianAccountId/recipes`) — reusable meal library

Practice-scoped reusable meals. Ingredient foods may be global ACTIVE catalog foods or this practice’s custom foods only. Nutrition is calculated via `FoodService.getEffective()` / `packages/nutrition`; never accepted as an authoritative client field. Patients have no private recipe-library endpoint.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/recipes` | Member | Search (`q`, `status`, `page`, `pageSize` ≤ 50). Default status `ACTIVE` |
| POST | `/recipes` | OWNER/DIETITIAN | Create (`name`, `servings` > 0, optional description/instructions) |
| GET | `/recipes/:recipeId` | Member | Recipe + live calculated total/per-serving nutrition |
| PATCH | `/recipes/:recipeId` | OWNER/DIETITIAN | Update metadata. Archived recipes cannot be edited |
| POST | `/recipes/:recipeId/archive` | OWNER/DIETITIAN | Soft-archive (`ARCHIVED`) |
| POST | `/recipes/:recipeId/duplicate` | OWNER/DIETITIAN | Copy recipe + ingredients as a new ACTIVE recipe |
| PUT | `/recipes/:recipeId/ingredients` | OWNER/DIETITIAN | Replace ingredient list. Units: `g`/`kg`/`oz`/`lb`/`ml`/`l`/`fl_oz` |

Recipe meal-item quantity: `unit` must be `serving`. `quantity` is the number of recipe servings, not copies of the whole recipe.

### Meal plans (`/api/v1/dietitian/:dietitianAccountId/meal-plans`)

Every endpoint authenticates, establishes tenant context, and uses `ClientAccessService` for the plan’s client. Writes use `manageRecords`. GET version is the draft preview (live calculation) or the published/superseded snapshot (`immutable: true`).

**Product Phase 9:** meals are composed from `MealItem` FOOD (catalog/custom) and RECIPE (reusable meal library) rows. Nutrition is never typed by hand — drafts recalculate via `packages/nutrition`; publish freezes item/meal/day nutrition in `snapshot`. Food items in the snapshot include `origin`.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/meal-plans` | Member + visible clients | List (`clientId`, `status`, pagination) |
| POST | `/meal-plans` | manageRecords | Create plan + draft version 1 + first day + Breakfast/Lunch/Dinner (`dayLabelMode`: `NUMBERED` \| `WEEKDAY`) |
| GET | `/meal-plans/:planId` | read | Plan metadata + version list (`dayLabelMode`) |
| PATCH | `/meal-plans/:planId` | manageRecords | Name/description/`dayLabelMode` (relabels draft days) |
| POST | `/meal-plans/:planId/archive` | manageRecords | Soft-archive plan |
| POST | `/meal-plans/:planId/versions` | manageRecords | Clone latest version into a new DRAFT (409 if a draft exists) |
| GET | `/meal-plans/:planId/versions/:versionId` | read | Draft = live snapshot; published/superseded = stored snapshot |
| POST | `/meal-plans/:planId/versions/:versionId/publish` | manageRecords | Validate, write snapshot, supersede previous PUBLISHED, mark ACTIVE |
| POST | `/.../versions/:versionId/days` | manageRecords | Add day (draft only) |
| PATCH/DELETE | `/.../days/:dayId` | manageRecords | Draft only |
| POST | `/.../days/:dayId/meals` | manageRecords | Create meal (name presets in UI; free-text `name` in API) |
| PATCH/DELETE | `/.../meals/:mealId` | manageRecords | Rename/reorder/notes/delete (draft only) |
| POST | `/.../meals/:mealId/items` | manageRecords | FOOD (mass/volume) or RECIPE (`serving`) |
| PATCH/DELETE | `/.../items/:itemId` | manageRecords | Quantity/unit/notes/sortOrder (draft only) |

Published versions reject content mutations (`400` “Published versions cannot be modified”). Empty drafts cannot publish. Archived recipes cannot be added as new items. Cross-practice custom foods/recipes are rejected.

## Client portal

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/portal/me` | Session + active client account | Portal identity |
| POST | `/api/v1/portal/join-code/resolve` | Patient session | Preview practice **or per-client** join code: `{ status: "ok" \| "already_connected", practiceName, dietitianDisplayName, clientId? }`. Invalid/expired/used codes reject like join |
| POST | `/api/v1/portal/join` | Patient session | Confirm join with the same code. Creates `Client` + `ClientAccount` when new; `{ status: "joined" \| "already_connected", … }`. Does not consume reusable practice invites |
| GET | `/api/v1/portal/connections` | Patient session | List linked practices / client accounts |
| POST | `/api/v1/portal/connections/active` | Patient session | Set `Session.activeClientId` for portal scoping |
| POST | `/api/v1/portal/connections/disconnect-request` | Patient session | Request leave for active (or specified) connection. Sets `disconnectRequestedAt`; does **not** deactivate. Optional `{ note?, clientId? }` |
| DELETE | `/api/v1/portal/connections/disconnect-request` | Patient session | Cancel a pending leave request |
| GET | `/api/v1/portal/meal-plan` | Session + active client account | Current published plan snapshot only (composition + meal/day nutrition). Drafts and superseded versions are not returned. `{ plan: null }` when none exists |

Portal cookies cannot call dietitian meal-plan routes.

### Client tracking — portal (`/api/v1/portal/tracking`)

Authenticated client account only (`Session.activeClientId`). Mutations use `assertPortalAccess`. Food search for logging: `GET /api/v1/portal/foods` (catalog **and** practice-visible custom foods for the active connection).

| Method | Path | Description |
|---|---|---|
| GET | `/summary` | Daily derived totals (`?date=YYYY-MM-DD`). Includes `food.byMeal` (with `sourceType`/`displayName`), water `entries` + `targetMl`, exercise `entries`, `sleepWeek`, assignment-based `habits`, `plannedMeals.{logged,total}` |
| GET/POST/PATCH/DELETE | `/food-logs` … | Food logging with immutable `nutrition_snapshot`; optional `mealCategory`. Planned meal logs use `sourceType=PLANNED_MEAL` and nullable `foodId` |
| GET/POST/PATCH/DELETE | `/water-logs` … | Water logging (`amount` + `ml`/`l`, stored as ml) |
| GET/POST/PATCH/DELETE | `/exercise-logs` … | Exercise log (optional intensity) |
| GET/PUT/DELETE | `/sleep` … | Upsert one sleep row per local date |
| GET/PUT | `/habits` … | Legacy freeform habit upsert (still available) |
| POST | `/log-planned-meal` | Log a published meal as **one** FoodLog from the plan snapshot (`{ mealId, date?, servings?, clientRequestId? }`). Includes FOOD and RECIPE items; nutrition scaled by `servings` |

### Portal habits (`/api/v1/portal/habits`)

| Method | Path | Description |
|---|---|---|
| GET | `/` | Assigned habits for active client + today’s completion (`?date=`) |
| PUT | `/:habitDefinitionId/log` | Complete/undo assigned habit (`{ completed, date? }`) |

### Practice habits

| Method | Path | Description |
|---|---|---|
| GET/POST | `/api/v1/dietitian/:dietitianAccountId/habits` | List global+practice catalog / create practice habit |
| PATCH | `/api/v1/dietitian/:dietitianAccountId/habits/:habitId` | Update practice-owned habit |
| GET/POST/DELETE | `/api/v1/dietitian/:dietitianAccountId/clients/:clientId/habits` | List / assign / unassign |

### Portal measurements

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/portal/measurements` | Create measurement for active client (`type`, `value`, `unit`, optional `measuredAt`). Feeds existing Evolution API |

### Client tracking — dietitian review (`/api/v1/dietitian/:dietitianAccountId/clients/:clientId/tracking`)

Read-only. `ClientAccessService` `read`. Same summary/list shapes as portal (including Phase 10 summary enrichment). There are **no** practice POST routes for food/water/exercise/sleep logs — daily tracking remains patient-owned. Dietitian-managed care uses profile, measurements, goals, meal plans, assessments, and appointments instead.

| Method | Path | Description |
|---|---|---|
| GET | `/summary` | Daily summary |
| GET | `/food-logs` | Food logs for date |
| GET | `/water-logs` | Water logs for date |
| GET | `/exercise-logs` | Exercise logs for date |
| GET | `/sleep` | Sleep for date |
| GET | `/habits` | Habit logs for date |

### Messaging — portal (`/api/v1/portal/conversation`)

| Method | Path | Description |
|---|---|---|
| GET | `/` | Conversation + unread count |
| GET | `/messages` | Paginated messages |
| POST | `/messages` | Send message (persists; emits realtime) |
| POST | `/read` | Mark read (persists; emits realtime) |

### Appointments — portal (`/api/v1/portal/appointments`)

Scoped to `Session.activeClientId` + `ClientAccount` (never trust a browser `clientId` alone).

| Method | Path | Description |
|---|---|---|
| GET | `/` | List appointments for the active connection |
| GET | `/:appointmentId` | Detail |
| POST | `/:appointmentId/cancel` | Patient cancel |
| POST | `/:appointmentId/propose-reschedule` | Patient proposes `{ startAt, endAt }` |
| POST | `/:appointmentId/accept-reschedule` | Accept dietitian proposal |
| POST | `/:appointmentId/reject-reschedule` | Reject dietitian proposal |

Statuses: `SCHEDULED`, `RESCHEDULE_PENDING`, `CANCELLED`, `COMPLETED`, `NO_SHOW`. Categories: `CONSULTATION`, `FOLLOW_UP`, `ASSESSMENT`, `MEAL_PLAN`, `OTHER`. Overlap prevention is per `dietitianAccountId` for `SCHEDULED`/`RESCHEDULE_PENDING`. Appointment changes use REST + `NotificationService` (no Socket.IO appointment events).

### Assessments & evolution — portal

Scoped to `Session.activeClientId` + `ClientAccount`. Portal **cannot** start assessments — the dietitian starts them for the client.

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/portal/assessments` | List assessments for the active client only |
| GET | `/api/v1/portal/assessments/:assessmentId` | Detail (schema from `schemaSnapshot`) |
| PATCH | `/api/v1/portal/assessments/:assessmentId` | Save draft responses (validated types/options) |
| POST | `/api/v1/portal/assessments/:assessmentId/complete` | Submit → `COMPLETED` (required fields enforced) |
| GET | `/api/v1/portal/evolution` | Measurement evolution for the active client (`?from=&to=`) |
| POST | `/api/v1/portal/measurements` | Log weight/height/etc. for the active client |

**Model**

```text
Template (AssessmentTemplate) = reusable evaluation form for a practice
Assessment = client-specific instance (answers + status + timestamps)
schemaSnapshot = frozen question definition used by that assessment
responses = client answers (JSON object keyed by question id)
```

Assessment templates use a schema contract (`sections[].questions[]` with types `TEXT`, `TEXTAREA`, `NUMBER`, `BOOLEAN`, `SINGLE_CHOICE`, `MULTI_CHOICE`). Deactivating a question soft-flags `active: false`. Started assessments freeze `schemaSnapshot` so historical responses stay readable after template edits. Templates are **practice-scoped** (`dietitianAccountId` required); platform-shared template seeding is disabled.

### Messaging — practice (`/api/v1/dietitian/:dietitianAccountId`)

| Method | Path | Description |
|---|---|---|
| GET | `/conversations` | Inbox for visible clients |
| GET/POST | `/clients/:clientId/conversation/...` | Thread, send, read |

### Realtime (`Socket.IO` namespace `/realtime`)

Cookie auth: same `ns_session` as REST (`withCredentials`). Client emits `conversation.subscribe` with `{ clientId }` only; server authorizes and joins `conversation:{id}`. Events: `message.created`, `conversation.updated`, `message.read`, `unread_count.updated`. REST remains the persistence path; sockets are transport-only.

### Documents — portal (`/api/v1/portal/documents`)

Shared documents only. Authenticated multipart upload + download stream.

### Documents — organization (`/organizations/:orgId/clients/:clientId/documents`)

List, upload, download, share/unshare (`PATCH visibility`), archive.

### Notifications

Practice: `GET/PATCH/POST /api/v1/dietitian/:dietitianAccountId/notifications` (+ `/unread-count`, `/:id/read`, `/read-all`).
Portal: `/api/v1/portal/notifications` (same operations; scoped by `activeClientId` → dietitianAccountId).
Types include messages, documents, invoices, tasks, appointments (`APPOINTMENT_CREATED` / `UPDATED` / `CANCELLED` / `RESCHEDULE_PROPOSED` / `RESCHEDULE_ACCEPTED` / `RESCHEDULE_REJECTED`), client join, subscription lifecycle, and `MEAL_PLAN_PUBLISHED`. In-app only (email is separate and gated).

### Invoices — portal (`/api/v1/portal/invoices`)

| Method | Path | Description |
|---|---|---|
| GET | `/` | List sent/issued/paid/overdue invoices for authenticated client |
| GET | `/:invoiceId` | Invoice detail + practice header for print view |

Clients cannot mutate invoice status or amounts.

### Invoices — organization

| Method | Path | Description |
|---|---|---|
| GET | `/organizations/:orgId/invoices` | List/filter/paginate (client, status, search, overdue) |
| POST | `/organizations/:orgId/invoices` | Create draft (body includes `clientId` + items) |
| GET | `/organizations/:orgId/invoices/:invoiceId` | Detail |
| GET | `/organizations/:orgId/invoices/:invoiceId/print` | Print payload (practice + invoice) |
| PATCH | `/organizations/:orgId/invoices/:invoiceId` | Edit draft only |
| POST | `.../issue`, `.../send`, `.../pay`, `.../cancel`, `.../archive` | Lifecycle |
| GET/POST | `/organizations/:orgId/clients/:clientId/invoices` | Client workspace list / create draft |

Totals are computed server-side from line items (`quantity`, `unitPrice`), then optional **discount** (`discountType` `PERCENT`|`FIXED` + `discountValue`) and **tax** (`taxRatePercent` applied to taxable amount after discount). Response includes `subtotal`, `discountAmount`, `taxAmount`, and `total`. New drafts inherit `invoiceDefaultTaxPercent` from dietitian settings when tax is omitted. Print/download uses browser print → Save as PDF (no server PDF binary).

Create/update draft body may include: `discountType`, `discountValue`, `taxRatePercent`, `notes`, plus line `items`.

### Tasks — organization (`/organizations/:orgId/tasks`)

| Method | Path | Description |
|---|---|---|
| GET | `/` | List with views: `all`, `mine`, `due_today`, `upcoming`, `overdue`, `completed` |
| POST | `/` | Create (OWNER/DIETITIAN; STAFF cannot create) |
| GET/PATCH | `/:taskId` | Read / update |
| POST | `/:taskId/complete`, `/:taskId/cancel`, `/:taskId/archive` | Workflow |
| GET | `/organizations/:orgId/clients/:clientId/tasks` | Client-scoped task list (internal) |

### Analytics — organization (`/organizations/:orgId/analytics`)

| Method | Path | Query | Description |
|---|---|---|---|
| GET | `/overview` | `period`, `startDate`, `endDate` | Practice KPIs |
| GET | `/clients` | same | Activity + needs-attention (transparent reasons) |
| GET | `/activity` | same | Tracking log counts |
| GET | `/financial` | same | Invoice aggregates |

Periods: `today`, `this_week`, `this_month`, `last_30_days`, `last_90_days`, `custom`.

### AI — organization

| Method | Path | Description |
|---|---|---|
| GET | `/organizations/:orgId/ai/usage` | Used/limit/remaining for current period |

### AI — client (dietitian only, `ClientAccessGuard`)

| Method | Path | Description |
|---|---|---|
| POST | `/organizations/:orgId/clients/:clientId/ai/client-summary` | AI client overview draft |
| POST | `.../meal-plan-assistance` | Meal suggestions (no auto-publish) |
| POST | `.../nutrition-assistance` | Food/nutrition help (`foodQuery` optional) |
| POST | `.../consultation-summary` | Consultation summary draft |
| POST | `.../message-draft` | Message draft (no auto-send) |

All AI endpoints return structured JSON with a review disclaimer. No provider API keys in responses.

### Admin AI

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/admin/organizations/:orgId/ai/usage` | Platform admin inspects org AI usage |

### Automations — organization (`OWNER` / `DIETITIAN`; `STAFF` denied)

| Method | Path | Description |
|---|---|---|
| GET | `/organizations/:orgId/automations` | List rules |
| GET | `/organizations/:orgId/automations/usage/summary` | Rule/execution usage vs entitlements |
| POST | `/organizations/:orgId/automations` | Create rule (starts `PAUSED`) |
| GET | `/organizations/:orgId/automations/:automationId` | Rule detail |
| PATCH | `/organizations/:orgId/automations/:automationId` | Update rule |
| POST | `/organizations/:orgId/automations/:automationId/activate` | Activate |
| POST | `/organizations/:orgId/automations/:automationId/pause` | Pause |
| POST | `/organizations/:orgId/automations/:automationId/archive` | Archive |
| GET | `/organizations/:orgId/automations/:automationId/runs` | Runs for one rule |
| GET | `/organizations/:orgId/automation-runs` | Recent org runs |

Configuration/conditions are validated server-side (no arbitrary code). Template variables must be from the controlled catalog.

### Admin automation

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/admin/organizations/:orgId/automation/summary` | Rule counts and recent failures |

## Platform admin (`/api/v1/admin`)

Requires a session **and** `users.platform_role` of `ADMIN` or `SUPER_ADMIN`. Organization OWNER is not sufficient. Failures return `403` `"Platform administration is not available"`. Extra body fields are rejected (`400`).

`GET /api/v1/admin/me` is the gate used by `/admin` UI. All admin mutations write `audit_logs` through `SecurityEventLogger`.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/admin/me` | Platform admin | Current admin identity |
| GET | `/api/v1/admin/organizations` | Platform admin | List/search organizations |
| GET | `/api/v1/admin/organizations/:organizationId` | Platform admin | Organization, members, subscription, effective entitlements |
| PATCH | `/api/v1/admin/organizations/:organizationId/status` | Platform admin | `ACTIVE` / `SUSPENDED` / `ARCHIVED` |
| GET | `/api/v1/admin/organizations/:organizationId/entitlements` | Platform admin | Plan vs override vs effective matrix |
| GET | `/api/v1/admin/organizations/:organizationId/subscription` | Platform admin | Single subscription |
| PUT | `/api/v1/admin/organizations/:organizationId/subscription` | Platform admin | Assign or change plan (`planId`, optional `status`) |
| PATCH | `/api/v1/admin/organizations/:organizationId/subscription` | Platform admin | Subscription lifecycle |
| PUT | `/api/v1/admin/organizations/:organizationId/overrides/:featureKey` | Platform admin | Create/update override |
| DELETE | `/api/v1/admin/organizations/:organizationId/overrides/:featureKey` | Platform admin | Remove override (plan entitlement restored) |
| GET | `/api/v1/admin/users` | Platform admin | List/search users |
| GET | `/api/v1/admin/users/:userId` | Platform admin | User + memberships (roles are read-only here) |
| PATCH | `/api/v1/admin/users/:userId/status` | Platform admin | `ACTIVE` / `SUSPENDED` / `ARCHIVED` |
| PATCH | `/api/v1/admin/users/:userId/platform-role` | SUPER_ADMIN | Set `SUPER_ADMIN` / `ADMIN` / `null` |
| GET | `/api/v1/admin/plans` | Platform admin | List plans |
| POST | `/api/v1/admin/plans` | Platform admin | Create plan |
| GET | `/api/v1/admin/plans/:planId` | Platform admin | Plan + features |
| PATCH | `/api/v1/admin/plans/:planId` | Platform admin | Name/description/status. No destructive delete. |
| PUT | `/api/v1/admin/plans/:planId/features` | Platform admin | Replace plan features/limits |
| GET | `/api/v1/admin/features` | Platform admin | Feature catalog |
| POST | `/api/v1/admin/features` | Platform admin | Create feature |
| PATCH | `/api/v1/admin/features/:featureId` | Platform admin | Name/description/global status |
| GET | `/api/v1/admin/subscriptions` | Platform admin | All organization subscriptions |
| GET | `/api/v1/admin/audit` | Platform admin | Audit log list/search |
| GET | `/api/v1/admin/food-sources` | Platform admin | Read-only catalog sources (excludes `practice-custom`) |
| GET | `/api/v1/admin/food-sources/foods` | Platform admin | Browse global catalog foods (`q`, `sourceId`, pagination) |
| POST | `/api/v1/admin/food-sources/import` | Platform admin | Import bundled curated Foundation dataset via existing importer (no remote URL) |

There is no payment, billing portal, or subscription invoice API. Impersonation is not implemented.

**PUT `/api/v1/admin/organizations/:organizationId/subscription`**

```json
{ "planId": "uuid", "status": "ACTIVE" }
```

**PUT `/api/v1/admin/organizations/:organizationId/overrides/AI_REQUEST_LIMIT`**

```json
{ "enabled": true, "limitValue": 50, "reason": "Pilot quota" }
```

