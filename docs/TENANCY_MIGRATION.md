# Tenancy Migration Status

Tracks the DietitianAccount tenancy restructure (Phases 1–4).

| Phase | Scope | Status |
|-------|--------|--------|
| **Phase 1** | `DietitianAccount` + dual-write with Organization; path param still `:organizationId` (= account id); `dietitianAccountId` on tenant rows; backfill | **Done** |
| **Phase 2** | Auth cutover / persona isolation (dietitian ↔ portal mutual exclusion); TenantGuard owner-only synthetic role | **Done** |
| **Phase 3** | Product cutover: `registrationEnabled` gate, admin dietitian provision + `DIETITIAN_ACTIVATION`, portal multi-connection + `Session.activeClientId`, web `/practice` remount, patient connection switcher | **Done** (app + migration `20260820190000_phase3_registration_active_client`) |
| **Phase 4** | API remount `/api/v1/dietitian`, `DietitianGuard`, drop org membership shells / dual-write / legacy org tables | **Deferred** |

## Phase 3 notes

- Self-serve `POST /api/v1/auth/register` and `POST /api/v1/organizations` require `PlatformSettings.registrationEnabled` (default `false`).
- Admin: `POST /api/v1/admin/dietitians` creates User + DietitianAccount (via Organization dual-write) + optional ACTIVE subscription + activation email.
- Patients may hold multiple ACTIVE `ClientAccount` rows (`@@unique([userId, dietitianAccountId])`). Portal clinical ops use `Session.activeClientId`.
- Web dietitian surface is `/practice/:id` (redirects from `/orgs`). API remains `/api/v1/organizations/:organizationId`.

## Phase 4 (not started)

Do **not** implement until Phase 3 is verified in production-like environments:

- Remount practice APIs under `/api/v1/dietitian`
- Replace TenantGuard with DietitianGuard
- Remove synthetic membership/role fields and membership/assignment routes
- Stop Organization dual-write; drop `organizationId` / Organization / OrganizationMember / ClientAssignment when safe
