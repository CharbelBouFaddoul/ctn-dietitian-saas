# Security

> **Tenancy (current):** Practice authorization is `DietitianAccount` ownership via `DietitianGuard` (`dietitianAccountId`). OrganizationMember / `TenantGuard` / `organization_id` narratives below are historical unless updated. See [TENANCY_MIGRATION.md](./TENANCY_MIGRATION.md).

**Status:** Phase 13 production hardening implemented  
**Full model:** [ARCHITECTURE.md](./ARCHITECTURE.md), master specification §64–85

## Phase 1 (still in force)

- Secrets live in environment variables; `.env` is gitignored
- `.env.example` documents required variables without production secrets
- Helmet security headers on the API
- CORS origin is configured via `CORS_ORIGIN` with `credentials: true`
- OpenAPI/Swagger is not public in production by default (`SWAGGER_ENABLED`)
- Files will be private by default (storage abstraction only in Phase 1)
- Structured logs must never include passwords, tokens, or secrets

## Phase 2 — Authentication

### Identity vs authorization

The auth layer answers **who is this user?** Organization membership answers **which organization** and **what org role**. Client visibility, entitlements, and `ClientAccessService` are later phases.

### Passwords

- Argon2id (`argon2` library). Never store plaintext.
- OWASP-style parameters in non-test environments (19 MiB, time cost 2, parallelism 1). Tests use a cheaper cost so the suite can run.
- Configurable minimum length (`PASSWORD_MIN_LENGTH`, default 10), max 128, require a letter and a number.
- Login always hashes/verifies (dummy Argon2id hash when the account is missing) and always returns `"Invalid email or password"` for unknown user, wrong password, `PENDING`, `SUSPENDED`, and `ARCHIVED`.

### Emails

Canonical form: trim, Unicode NFC, lowercase. Used for login, register, uniqueness, reset, and verification. Database uniqueness is on `users.email_normalized`.

### Sessions

- Cryptographically random 32-byte token (`base64url`) in an **httpOnly** cookie named `ns_session`.
- Server stores **HMAC-SHA256(token, AUTH_TOKEN_SECRET)** only. The raw token is never in PostgreSQL.
- Cookie flags: `HttpOnly`, `Path=/`, `SameSite=Lax`, `Max-Age` = session TTL, `Secure` in production (or when `COOKIE_SECURE=true`).
- Sessions expire (`expires_at`), are revocable (`revoked_at`), and track `last_used_at` plus optional IP/user-agent.
- Logout revokes the current session. Password reset revokes **all** sessions for that user.
- Suspended/archived/unverified users cannot use a session even if a cookie remains.
- Frontend must not put auth tokens in `localStorage`.

### CSRF strategy (cookie auth)

Phase 2 uses **SameSite=Lax** cookies + an explicit CORS origin allowlist + credentialed requests. `localhost:3000` (web) and `localhost:3001` (API) are same-site, so the session cookie is sent on `fetch(..., { credentials: "include" })`.

If web and API are ever hosted on different sites (different eTLD+1), add a CSRF token (or `SameSite=None; Secure` plus a synchronizer token). That is not required for the V1 same-site / subdomain layout.

The API sets `trust proxy` so `Secure` cookies and client IPs work behind Coolify/HTTPS.

### Tokens (verification, reset, invitation)

- Secure random raw token, shown once in email / returned from `InvitationService.create`.
- HMAC-SHA256 hash stored at rest (same pepper as sessions).
- Expiry + single use (`used_at`). Successful use invalidates sibling unused tokens for that user where applicable.
- Invitation tokens have a `purpose` discriminator (`DIETITIAN_ACTIVATION`, `STAFF_INVITE`, `CLIENT_INVITE`) and are **infrastructure only** in Phase 2.

### Rate limiting

`@nestjs/throttler` on `/api/v1/auth/*`. Defaults: `AUTH_THROTTLE_LIMIT=10` per `AUTH_THROTTLE_TTL_MS=60000` per IP. Returns `429`.

### Email delivery

`EmailService` + `ConsoleEmailProvider` (development adapter). No production vendor SDK in Phase 2. Verification and reset links use `APP_URL`.

### Audit

`SecurityEventLogger` writes structured logs **and** persists `audit_logs` for login success/failure, logout, register, email verification, verification resend, password reset request/completion, session revocation, organization created, membership created/deactivated, role changes, ownership transfer, organization status changes, and all platform admin mutations. It never logs or stores passwords, raw tokens, or secret-like metadata keys.

## Phase 4 — Platform admin, entitlements, audit

- Admin APIs require `SessionGuard` plus `users.platform_role` in `ADMIN` | `SUPER_ADMIN`. Frontend hiding is not authorization.
- Organization OWNER without a platform role cannot call `/api/v1/admin/*`.
- Clients cannot supply `platformRole` (forbidden extra properties; register has no such field).
- Organization membership roles cannot be changed through the platform user editor. Membership remains organization-scoped.
- `SUPER_ADMIN` vs `ADMIN`: both may manage orgs, plans, features, subscriptions, overrides, and audit. Only `SUPER_ADMIN` may assign platform roles. At least one `SUPER_ADMIN` must remain.
- One subscription row per organization (`subscriptions.organization_id` UNIQUE). Entitlement is denied unless that subscription is `ACTIVE`.
- `EntitlementService` is the only feature gate. Resolution: global feature ACTIVE → ACTIVE subscription → organization override → plan feature → default deny. Overrides cannot enable a globally inactive feature and cannot grant access without an ACTIVE subscription.
- Plan FK is `ON DELETE RESTRICT`. Deactivating a plan does not rewrite existing subscriptions.
- Audit metadata is sanitized (password/token/secret/hash/cookie keys dropped).
- Tests: `apps/api/test/admin.e2e.spec.ts` plus Phase 2/3 suites.

## Phase 3 — Tenant isolation

- Organization ID comes from the URL after `SessionGuard`. Body `role` / `organizationId` are not trusted.
- `TenantGuard` requires an **active** `organization_members` row for `(user, organization)`.
- `OrganizationLifecycleService` allows normal access only when the organization is `ACTIVE`.
- Tenant-owned reads/writes include `organizationId` (`tenantWhere`). Settings are keyed by `organization_id`, not a bare settings UUID.
- Unique `(organization_id, user_id)` and unique `slug` are database constraints.
- Last OWNER cannot be demoted or deactivated. Transfer is OWNER-only.
- Isolation tests in `apps/api/test/organizations.e2e.spec.ts` are release-blocking.

## Phase 5 — Client access

- Clients belong to an organization via `clients.organization_id`. Never `organization_members.role = CLIENT`.
- Portal authentication is `users` + `sessions`. `client_accounts` is a link table only (unique `user_id`, unique `client_id`). No passwords or sessions on `client_accounts`.
- `ClientAccessService` is required for every client-sensitive operation, including timeline. UUID knowledge is not authorization.
- OWNER: all organization clients. DIETITIAN/STAFF: active assignment only. STAFF cannot create/archive/assign/invite.
- Reassignment closes the previous assignment (`unassigned_at`) and inserts a new row. History is retained.
- Archive retains history, closes assignments, deactivates portal accounts, and revokes that user's sessions. Restore does not duplicate `users` or `clients`.
- Portal login/session validation fails when the account is not `ACTIVE` or the client is not `ACTIVE`.
- `CLIENT_LIMIT` is enforced by `EntitlementService` on create (server-side).
- Audit records important mutations without passwords, tokens, or full client payloads.
- Tests: `apps/api/test/clients.e2e.spec.ts` (tenancy, assignment, portal, archive, entitlements, audit).

## Phase 6 — Foods and overrides

- `foods` / `food_sources` are global. Dietitian endpoints can read them; they cannot PATCH/DELETE global foods.
- `food_overrides` are tenant-scoped (`organization_id`). Organization A cannot read or write Organization B overrides. Queries always use the session tenant, not a client-supplied org from the body.
- OWNER/DIETITIAN manage overrides. STAFF can search and view effective values only.
- Override mutations write `audit_logs` (`food_override_created` / `_updated` / `_removed`) with `foodId` and field names only — not passwords, tokens, or full nutrition payloads.
- No food-specific entitlement key is defined in the master spec; none was invented. Existing gates still go through `EntitlementService`.
- Tests: `apps/api/test/foods.e2e.spec.ts`, `food-import.spec.ts`, `nutrition-engine.spec.ts`.

## Phase 7 — Recipes and meal plans

- Recipes and meal plans are tenant-scoped (`organization_id` on every table). Organization A cannot read or modify Organization B recipes or meal plans.
- Recipe writes: OWNER/DIETITIAN. STAFF may read recipes, not create them.
- Meal plans use `ClientAccessService` only — no parallel client-authz in controllers. OWNER: all org clients. DIETITIAN/STAFF: assigned clients. UUID knowledge is not authorization.
- Portal clients see only their own current `PUBLISHED` snapshot. Drafts, superseded versions, other clients, and dietitian meal-plan routes are denied.
- Drafts recalculate through `FoodService.getEffective()`. Published `snapshot` JSON is immutable; later food overrides or recipe edits must not change it.
- Archive is soft. Archived recipes cannot be added to new meal items. Published snapshots remain valid.
- Audit: `recipe_created` / `recipe_updated` / `recipe_archived`, `meal_plan_created` / `meal_plan_updated` / `meal_plan_published` / `meal_plan_version_superseded` / `meal_plan_archived`. Metadata is identifiers and names, not full plan payloads or secrets.
- No recipe/meal-plan subscription feature key was invented. Existing gates still go through `EntitlementService`.
- Tests: `apps/api/test/meal-plans.e2e.spec.ts`, `nutrition-engine.spec.ts`.

## Phase 8 — Client tracking

- All tracking tables include `organization_id` and `client_id`. Organization A cannot read or write Organization B logs.
- Portal mutations require an active `client_accounts` link and `clients.status = ACTIVE`. Inactive/archived clients cannot access tracking.
- Dietitian/staff review uses `ClientAccessService` (`read`). OWNER: all clients. DIETITIAN/STAFF: assigned clients only. Dietitian tracking endpoints are read-only in V1.
- Food logs store `nutrition_snapshot` at create/edit time. Later food overrides must not change existing logs. Daily totals sum snapshots.
- Water is normalized to ml internally. Exercise/sleep/habit logs are tenant-isolated.
- Timeline create events (`FOOD_LOGGED`, `WATER_LOGGED`, `EXERCISE_LOGGED`, `SLEEP_LOGGED`, `HABIT_COMPLETED`) follow the same client-access rules; timeline is not an auth bypass.
- No tracking-specific subscription feature key was invented.
- Tests: `apps/api/test/tracking.e2e.spec.ts`, `timezone.spec.ts`.

## Phase 9 — Messaging and documents

- Messaging rows are scoped by `dietitianAccountId` + `clientId`.
- File downloads require authentication + `ClientAccessService`; guessing UUIDs does not bypass authz.
- `storage_key` is server-generated; original filename is metadata only. No public static file URLs.
- Portal sees `SHARED` documents only; `INTERNAL` returns 404 to clients.
- Magic-byte validation and `MAX_DOCUMENT_BYTES` enforced server-side.
- Timeline events do not bypass client access. Audit on document upload/share/archive/download-denied.
- **Realtime:** Socket.IO `/realtime` authenticates via `ns_session` cookie; conversation rooms are joined only after server-side dietitian ownership or portal `activeClientId` checks. Client-supplied `conversationId` / `dietitianAccountId` are not authorization inputs.
- Tests: `apps/api/test/messaging-documents.e2e.spec.ts`, `apps/api/test/phase5-chat-websocket.e2e.spec.ts`.

## Phase 10 — Invoices, tasks, analytics

- Invoices and tasks are organization-scoped; client-linked rows require `ClientAccessService`.
- Portal invoice access is read-only via `assertPortalAccess`; DRAFT/CANCELLED invoices are hidden.
- Invoice totals and line totals are server-calculated; clients cannot mutate status or amounts.
- Invoice numbers allocated atomically via `invoice_sequences` (no unprotected MAX+1).
- Issued/paid/cancelled invoices are retained; drafts editable, issued immutable.
- Tasks are internal — not exposed on client portal.
- Analytics respect tenant visibility (OWNER vs assigned DIETITIAN/STAFF) via `visibleWhere`.
- No payment processor, webhooks, or invented subscription feature keys.
- Audit: invoice create/issue/send/pay/cancel; task create/complete/cancel.
- Tests: `apps/api/test/invoices-tasks-analytics.e2e.spec.ts`.

## Phase 11 — AI assistance

- All AI routes require authentication + organization membership.
- Client-scoped AI requires `ClientAccessService` (`ClientAccessGuard`); arbitrary client UUIDs rejected.
- Entitlement via existing `AI` + `AI_REQUEST_LIMIT` features only — no separate AI billing.
- Usage limits enforced server-side with serializable DB transactions before provider calls.
- Globally inactive `AI` feature denies all orgs regardless of plan.
- Provider API keys never exposed to browser or API responses.
- Structured AI output validated with zod; malformed output rejected.
- AI does not mutate clients, meal plans, messages, invoices, tasks, or tracking records.
- No client portal AI endpoints.
- Audit: entitlement denial, limit exceeded (via `ai_requests` REJECTED + security logger).
- Tests: `apps/api/test/ai.e2e.spec.ts`, `ai-output.spec.ts`.

## Phase 12 — Automation

- Automation management requires `OWNER` or `DIETITIAN`; `STAFF` denied.
- Entitlement via `AUTOMATION`, `AUTOMATION_RULE_LIMIT`, `AUTOMATION_EXECUTION_LIMIT` — no separate automation billing.
- Execution skips inactive/archived clients and non-`ACTIVE` organizations.
- Idempotency: unique `(organization_id, trigger_key)` prevents duplicate actions on retry.
- Template variables validated against catalog; unknown variables rejected at rule save.
- No arbitrary code/expressions in rule configuration.
- Actions use existing services only (`NotificationService`, `EmailService`, `TaskService.createFromAutomation()`).
- Automation does not mutate meal plans, send messages autonomously, or mark invoices paid.
- Worker queue isolated in worker process (`AutomationWorkerModule`); API does not run BullMQ consumer.
- Audit: rule create/update/activate/pause/archive via `SecurityEventLogger`.
- Tests: `apps/api/test/automation.e2e.spec.ts`, `automation-template.spec.ts`.

## Phase 13 — Production hardening

- Named rate limits via `@nestjs/throttler`: `auth`, `messaging`, `upload`, `ai` (env-configured TTL/limit).
- Production startup rejects default `AUTH_TOKEN_SECRET` placeholder and requires SMTP config when `EMAIL_PROVIDER=smtp`.
- `GlobalExceptionFilter` logs 5xx with request ID; never logs passwords, tokens, or clinical payloads.
- `ERROR_TRACKING_ENABLED=true` emits structured JSON suitable for external monitoring drains.
- OpenAPI at `/api/docs` disabled in production unless `SWAGGER_ENABLED=true`.
- `SmtpEmailProvider` for production transactional email; `ConsoleEmailProvider` for dev/test.
- Backup artifacts contain full tenant data — encrypt and restrict access.
- Release-blocking isolation suite: `apps/api/test/security-isolation.spec.ts`.
- §87 acceptance workflow: `apps/api/test/acceptance-workflow.e2e.spec.ts` (adapted; no staff invitation API).
- Ops: [DEPLOYMENT.md](./DEPLOYMENT.md), [RUNBOOK.md](./RUNBOOK.md).

## Later phases (not implemented)

- Impersonation (explicit, bannered, audited, real actor preserved)
- Remaining isolation tests in [DATABASE.md](./DATABASE.md) that need messaging (item 14)
