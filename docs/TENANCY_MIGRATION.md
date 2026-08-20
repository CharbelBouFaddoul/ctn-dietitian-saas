# Tenancy Migration Status

Tracks the DietitianAccount tenancy restructure (Phases 1–6+).

| Phase | Scope | Status |
|-------|--------|--------|
| **Phase 1** | `DietitianAccount` + dual-write with Organization; path param still `:organizationId` (= account id); `dietitianAccountId` on tenant rows; backfill | **Done** |
| **Phase 2** | Auth cutover / persona isolation (dietitian ↔ portal mutual exclusion); TenantGuard owner-only synthetic role | **Done** |
| **Phase 3** | Product cutover: `registrationEnabled` gate, admin dietitian provision + `DIETITIAN_ACTIVATION`, portal multi-connection + `Session.activeClientId`, web `/practice` remount, patient connection switcher | **Done** |
| **Phase 4** | Subscription lifecycle (ACTIVE → GRACE 3d → READ_ONLY 7d → LOCKED), period dates, CLIENT_LIMIT seeds, centralized TenantGuard enforcement | **Done** |
| **Phase 5** | Practice/portal dashboards, notification types + mark-all-read + bell UI, `emailNotificationsEnabled` product-email gate, auth-route redirects | **Done** |
| **Phase 6+** | API remount `/api/v1/dietitian`, `DietitianGuard`, drop org membership shells / dual-write / legacy org tables | **Deferred** |

## Phase 4 notes

- Lifecycle states are **derived** from `Subscription.status` + `currentPeriodEnd` (server clock). Not new enum values.
- Grace = 3 days, read-only = 7 days after period end (UTC hour windows from `packages/config`).
- `TenantGuard` attaches access state; LOCKED blocks practice APIs; READ_ONLY allows GET only.
- Entitlements resolve for ACTIVE + GRACE only.
- Seeded `CLIENT_LIMIT`: standard 25, pro 100, premium 300 (overrides still supported).
- Admin: assign/renew with `currentPeriodEnd`; `POST …/subscription/renew`.
- Dietitian: `GET …/subscription-access` (allowed when LOCKED for UI).
- Patients keep portal access when dietitian is locked; **new joins** blocked for LOCKED practices.
- No payment provider. API path remains `/api/v1/organizations/:organizationId`.

## Phase 5 notes

- Reuses `Notification` + `NotificationService` (no second notification system). New types: `APPOINTMENT_*`, `CLIENT_JOINED`, `SUBSCRIPTION_*`.
- `POST …/notifications/read-all` on org + portal; shells poll unread-count (no WebSockets).
- `PlatformSettings.emailNotificationsEnabled` default **false** (admin-only): gates invoice + automation product emails; auth emails always send.
- Practice dashboard extended (`todayAppointments`, conversations, notifications). Portal: `GET /api/v1/portal/dashboard`.
- Auth: client login + both register pages redirect when a session already exists.

## Phase 6+ (deferred remount)

- Remount practice APIs under `/api/v1/dietitian`
- Replace TenantGuard with DietitianGuard
- Remove synthetic membership/role fields and membership/assignment routes
- Stop Organization dual-write; drop `organizationId` / Organization / OrganizationMember / ClientAssignment when safe
