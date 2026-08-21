# Tenancy Migration Status

Tracks the DietitianAccount tenancy restructure (Phases 1–7) and Phase 2.5 cleanup.

| Phase | Scope | Status |
|-------|--------|--------|
| **Phase 1** | `DietitianAccount` + dual-write with Organization; path param still `:organizationId` (= account id); `dietitianAccountId` on tenant rows; backfill | **Done** |
| **Phase 2** | Auth cutover / persona isolation (dietitian ↔ portal mutual exclusion); TenantGuard owner-only synthetic role | **Done** |
| **Phase 2.5** | Remove Organization runtime shells/aliases; rename false `organizationId` → `dietitianAccountId`; drop membership assignment API | **Done** |
| **Phase 3** | Product cutover: `registrationEnabled` gate, admin dietitian provision + `DIETITIAN_ACTIVATION`, portal multi-connection + `Session.activeClientId`, reusable practice join codes, resolve-then-confirm join UX | **Done** |
| **Phase 4** | Subscription lifecycle (ACTIVE → GRACE 3d → READ_ONLY 7d → LOCKED), period dates, CLIENT_LIMIT seeds, centralized TenantGuard enforcement | **Done** |
| **Phase 5** | Practice/portal dashboards, notification types + mark-all-read + bell UI, `emailNotificationsEnabled` product-email gate, auth-route redirects | **Done** |
| **Phase 6** | Client Portfolio aggregate + chart tab IA, timeline pagination, assessment read-only GET, portal profile enrichment | **Done** |
| **Phase 7** | API remount `/api/v1/dietitian`, `DietitianGuard`, stop dual-write, drop Organization/OrganizationMember/OrganizationSettings + `organizationId` columns | **Done** |

## Canonical model (after Phase 7 + 2.5)

```text
Dietitian User → DietitianAccount (1:1) → practice domain
Patient User → ClientAccount → Client → DietitianAccount
```

No Organization layer. No OrganizationMember. No STAFF tenancy. No `organizationId` fallback.

## Phase 2.5 notes

- Deleted `apps/api/src/organizations/` compatibility shim (`OrganizationModule` re-export).
- Live DTOs live under `apps/api/src/dietitian/dto/` (`CreateDietitianDto`, etc.).
- Admin service renamed to `AdminDietitianAccountService`; admin APIs remain `/api/v1/admin/dietitians`.
- Removed ClientAssignment HTTP API (assignments are not authorization).
- Web: removed `/admin/organizations` redirect pages; **`next.config` `/orgs` → `/practice` redirects retained** (intentional URL compatibility only).
- Historical Prisma migrations unchanged. Schema already Organization-free since Phase 7.

## Phase 7 notes

- Canonical practice tenant: **`DietitianAccount`**. Path: `/api/v1/dietitian/:dietitianAccountId`.
- **`DietitianGuard`** replaces `TenantGuard`; context is `DietitianTenantContext` (`dietitianAccountId`, `displayName`, `accountStatus`, `subscriptionAccess`).
- Practice authorization is **single-owner** (`DietitianAccount.userId`). No `OrganizationMember` / OrgRoles.
- Account create writes **only** `DietitianAccount` + `DietitianSettings` (plus existing subscription attach where applicable).
- Domain rows are scoped by required **`dietitianAccountId`**. Legacy Organization shell tables removed (migration `20260820210000_phase7_dietitian_tenancy`).
- `ClientAssignment` rekeyed to `userId`; Appointment/Task use `assignedUserId`. Assignments are **not** used for authorization.
- Admin: `/api/v1/admin/dietitians/:dietitianAccountId`. Web: `/practice/:dietitianAccountId`.
- Portal unchanged: `ClientAccount` + `Session.activeClientId`.
- Shared catalogs: `Food.dietitianAccountId` and `Recipe.dietitianAccountId` may be **null** for platform catalog/Starter rows (readable by all practices; not practice-private). Marketing routes are guest-only for signed-in users.

## Phase 3 notes

- Reusable practice join codes: `InvitationToken` `CLIENT_INVITE` with `clientId=null` and `dietitianAccountId` set; redeem does **not** consume the token.
- Resolve-then-confirm: `POST /api/v1/portal/join-code/resolve` (preview identity only) → `POST /api/v1/portal/join` (confirm; browser never chooses `dietitianAccountId` as authority).
- Join responses: `{ status: "joined" | "already_connected", practiceName, dietitianDisplayName, clientId, … }`.
- Connected patients may open `/client/join` to link another practice; portal layout connection switcher uses `Session.activeClientId`.
- Isolation: `assertPortalAccess` + `DietitianGuard`; no Organization / STAFF reintroduction.
- **Dietitian-managed patients:** `POST …/clients` creates a chart without `User`/`ClientAccount`. Practice can manage profile, measurements (→ Evolution), goals, meal plans, assessments, and appointments without portal login. Portal join later reuses the same Client. Daily tracking writes stay on `/portal/tracking` only. Covered by `test/dietitian-managed-client.e2e.spec.ts`.

## Phase 4 notes

- Lifecycle states are **derived** from `Subscription.status` + `currentPeriodEnd` (server clock). Not new enum values.
- Grace = 3 days, read-only = 7 days after period end (UTC hour windows from `packages/config`).
- Guard attaches access state; LOCKED blocks practice APIs; READ_ONLY allows GET only.
- Entitlements resolve for ACTIVE + GRACE only.
- Seeded `CLIENT_LIMIT`: standard 25, pro 100, premium 300 (overrides still supported).
- Patients keep portal access when dietitian is locked; **new joins** blocked for LOCKED practices.

## Phase 5 notes

- Reuses `Notification` + `NotificationService`. Types include `APPOINTMENT_*`, `CLIENT_JOINED`, `SUBSCRIPTION_*`, `MEAL_PLAN_PUBLISHED`.
- `POST …/notifications/read-all` on practice + portal; shells poll unread-count.
- `PlatformSettings.emailNotificationsEnabled` default **false**: gates invoice + automation product emails; auth emails always send.
- Practice dashboard extended; portal `GET /api/v1/portal/dashboard`.
- **Product Phase 4 polish:** practice dashboard adds `clientLimit`, `unreadMessageCount`, appointment `endAt`/`status`, recently-active clients UI; notification bell/list deep-link via `targetType`/`targetId`; meal-plan publish notifies linked patient.
- **Product Phase 5 (chat + WebSockets):** Socket.IO `/realtime` on existing Conversation/Message REST; Redis adapter; practice/portal chat UX; no schema change; no Organization.

## Phase 6 notes

- `GET …/clients/:clientId/portfolio` is read/composition-only.
- Timeline tab uses paginated `GET …/timeline?before=&limit=`.
- Portal `GET /api/v1/portal/me` includes lightweight personal + dietary/lifestyle + practice name.
- **Product Phase 6 (calendar + appointments):** extends `Appointment` with `category`, `RESCHEDULE_PENDING`, and proposal fields; practice calendar month/week/day; portal appointments under `activeClientId`; REST + notifications only (no appointment WebSockets); no Organization.

## Product Phase 7 assessments (practice-scoped)

- Templates require `dietitianAccountId` (platform-shared template seed is a no-op).
- Start freezes `schemaSnapshot`; GET/validate always prefer snapshot over live template.
- Portal fill/submit under `activeClientId` only; dietitian starts assessments (portal cannot create).
- Timeline events: `ASSESSMENT_STARTED`, `ASSESSMENT_COMPLETED`.

## Product Phase 8–11 notes (food / recipes / meal plans / tracking)

- Canonical tenant remains `dietitianAccountId`. No Organization / STAFF reintroduction.
- **Product Phase 8:** global + practice custom foods; Recipes = reusable meal library.
- **Product Phase 9:** MealPlan meals composed from Food + Recipe items; nutrition from `packages/nutrition` only; publish freezes snapshot; portal reads published plan for `activeClientId`.
- **Product Phase 10:** Tracking summary enrichment; portal `POST /measurements`; initial `log-planned-meal` (FOOD items); portal food search includes practice foods.
- **Product Phase 11:** planned-meal FoodLog snapshots (FOOD+RECIPE, servings); habit catalog + assignment; summary `plannedMeals`. Distinct from historical “Phase 11 AI”. Migration: `20260821010000_phase11_tracking_habits`.
- **Migration required for Phase 9–10:** no (Phase 9 day-label mode migration is separate if already applied).
