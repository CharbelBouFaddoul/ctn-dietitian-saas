# Tenancy Migration Status

Tracks the DietitianAccount tenancy restructure (Phases 1–7).

| Phase | Scope | Status |
|-------|--------|--------|
| **Phase 1** | `DietitianAccount` + dual-write with Organization; path param still `:organizationId` (= account id); `dietitianAccountId` on tenant rows; backfill | **Done** |
| **Phase 2** | Auth cutover / persona isolation (dietitian ↔ portal mutual exclusion); TenantGuard owner-only synthetic role | **Done** |
| **Phase 3** | Product cutover: `registrationEnabled` gate, admin dietitian provision + `DIETITIAN_ACTIVATION`, portal multi-connection + `Session.activeClientId`, web `/practice` remount, patient connection switcher | **Done** |
| **Phase 4** | Subscription lifecycle (ACTIVE → GRACE 3d → READ_ONLY 7d → LOCKED), period dates, CLIENT_LIMIT seeds, centralized TenantGuard enforcement | **Done** |
| **Phase 5** | Practice/portal dashboards, notification types + mark-all-read + bell UI, `emailNotificationsEnabled` product-email gate, auth-route redirects | **Done** |
| **Phase 6** | Client Portfolio aggregate + chart tab IA, timeline pagination, assessment read-only GET, portal profile enrichment | **Done** |
| **Phase 7** | API remount `/api/v1/dietitian`, `DietitianGuard`, stop dual-write, drop Organization/OrganizationMember/OrganizationSettings + `organizationId` columns | **Done** |

## Phase 7 notes

- Canonical practice tenant: **`DietitianAccount`**. Path: `/api/v1/dietitian/:dietitianAccountId`.
- **`DietitianGuard`** replaces `TenantGuard`; context is `DietitianTenantContext` (`dietitianAccountId`, `displayName`, `accountStatus`, `subscriptionAccess`). No synthetic membership/role fields.
- Practice authorization is **single-owner** (`DietitianAccount.userId`). No `OrganizationMember` / OrgRoles.
- Account create writes **only** `DietitianAccount` + `DietitianSettings` (plus existing subscription attach where applicable). No Organization dual-write.
- Domain rows are scoped by required **`dietitianAccountId`**. Legacy `organizationId` columns and Organization shell tables removed (migration `20260820210000_phase7_dietitian_tenancy`).
- `ClientAssignment` rekeyed to `userId`; Appointment/Task use `assignedUserId`. Assignments are **not** used for authorization.
- Admin practice resources: `/api/v1/admin/dietitians/:dietitianAccountId` (provision remains `POST /api/v1/admin/dietitians`).
- Web practice API clients use `/api/v1/dietitian`; browser routes stay `/practice/:dietitianAccountId`. `/orgs` redirects retained. Admin UI: `/admin/dietitians` (thin `/admin/organizations` redirects).
- Portal unchanged: `ClientAccount` + `Session.activeClientId`.
- Phase 4–6 product behavior preserved (lifecycle, notifications, portfolio).
- Profile photo upload still deferred. No payment provider.

## Phase 4 notes

- Lifecycle states are **derived** from `Subscription.status` + `currentPeriodEnd` (server clock). Not new enum values.
- Grace = 3 days, read-only = 7 days after period end (UTC hour windows from `packages/config`).
- Guard attaches access state; LOCKED blocks practice APIs; READ_ONLY allows GET only.
- Entitlements resolve for ACTIVE + GRACE only.
- Seeded `CLIENT_LIMIT`: standard 25, pro 100, premium 300 (overrides still supported).
- Patients keep portal access when dietitian is locked; **new joins** blocked for LOCKED practices.

## Phase 5 notes

- Reuses `Notification` + `NotificationService`. Types include `APPOINTMENT_*`, `CLIENT_JOINED`, `SUBSCRIPTION_*`.
- `POST …/notifications/read-all` on practice + portal; shells poll unread-count.
- `PlatformSettings.emailNotificationsEnabled` default **false**: gates invoice + automation product emails; auth emails always send.
- Practice dashboard extended; portal `GET /api/v1/portal/dashboard`.

## Phase 6 notes

- `GET …/clients/:clientId/portfolio` is read/composition-only.
- Timeline tab uses paginated `GET …/timeline?before=&limit=`.
- Portal `GET /api/v1/portal/me` includes lightweight personal + dietary/lifestyle + practice name.
