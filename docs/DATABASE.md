# Database

> **Tenancy (current):** Active schema scopes practice data with `dietitian_account_id` (not `organization_id`). Organization / organization_members tables were dropped in Phase 7. Treat `organization_id` table notes below as historical unless reconciled with `schema.prisma`. See [TENANCY_MIGRATION.md](./TENANCY_MIGRATION.md).

**Status:** Phase 9 messaging and documents implemented. Prisma migration `20260818050000_messaging_documents`.  
**Rule:** Do not create every table in Phase 1. Add models in the phase that needs them. Always use Prisma migrations. Never edit production schema by hand.

Authoritative product list remains the master specification. This document adds entities required by architecture clarifications: `client_accounts`, `client_assignments`, `timeline_events`, `tags`, `client_tags`, `sleep_logs`, `organization_settings`.

**Default tenant-ownership rule:** tenant-owned records should include their own `organization_id` even when a parent already identifies the organization (example: `meal_plans` has both `organization_id` and `client_id`). This is intentional for safer tenant queries, authorization, indexes, and preventing accidental cross-tenant access. Skip a redundant `organization_id` only when there is a strong technical reason.

Every tenant query must filter by organization.

---

## Conventions

- IDs: UUID
- Timestamps: `timestamptz`, stored in UTC
- Enums in Prisma for roles, statuses, timeline event types
- Indexes on `organization_id`, foreign keys, and high-cardinality filters (email, food search later)

---

## Archive / delete policy

Do not apply soft deletion blindly to every table.

**Archive / retain (default for important business records):** keep rows in the database; mark inactive/archived rather than physically deleting history. Applies to clients, recipes, meal plans, appointments, documents, invoices, and similar practice records.

**Preserve history (immutable / audited):** assignment history, meal plan versions, audit logs, timeline events. Do not destroy these to “clean up.”

**Hard delete / expire (disposable):** authentication tokens, expired sessions, and similar genuinely disposable records may be permanently deleted or expired.

Inactive/archived clients remain in the database. Do not physically delete normal client history because a client is no longer active.

---

## Phase 1 — Foundation

No domain tables.

Prove: PostgreSQL starts, Prisma connects, a baseline migration runs, client generates, API and worker can reach Postgres/Redis.

---

## Phase 2 — Authentication

Implemented. Prisma migration `20260817180000_auth_identity`. No organization, client, subscription, or product tables.

| Table | Purpose |
|---|---|
| `users` | Auth identity. UUID, `email`, unique `email_normalized`, Argon2id `password_hash`, `status` (`PENDING` \| `ACTIVE` \| `SUSPENDED` \| `ARCHIVED`), `email_verified_at`, nullable `platform_role` (`SUPER_ADMIN` \| `ADMIN`), `created_at` / `updated_at` / `suspended_at` / `archived_at`. **No organization role column.** |
| `sessions` | Revocable server-side sessions. Unique `token_hash` (HMAC of the cookie token), `expires_at`, `revoked_at`, `last_used_at`, optional IP/user-agent |
| `email_verification_tokens` | Hashed, expiring, single-use (`used_at`) |
| `password_reset_tokens` | Hashed, expiring, single-use |
| `invitation_tokens` | Hashed, expiring, single-use, `purpose` (`DIETITIAN_ACTIVATION` \| `STAFF_INVITE` \| `CLIENT_INVITE`). Infrastructure only in Phase 2 |
| `consents` | `user_id`, `type`, `policy_version`, `accepted_at`, optional IP |

Timestamps are `timestamptz`. IDs are UUID (`gen_random_uuid()`). Email uniqueness is enforced by a unique index on `email_normalized`, not only in application code.

Disposable auth tokens may be expired or later deleted. Users are not deleted for inactivity; they are suspended or archived.

---

## Phase 3 — Multi-tenancy

Implemented. Prisma migration `20260817200000_organizations`. No clients, subscriptions, or product tables.

| Table | Purpose |
|---|---|
| `organizations` | Tenant. Unique `slug`. Status `PENDING` \| `ACTIVE` \| `SUSPENDED` \| `ARCHIVED`. `archived_at` / `suspended_at`. Not hard-deleted in normal flows. |
| `organization_settings` | 1:1. IANA `timezone`, `locale`, `currency`, `weight_unit` (`kg` \| `lb`), `height_unit` (`cm` \| `in`), `date_format`. |
| `organization_members` | Staff only. `role` `OWNER` \| `DIETITIAN` \| `STAFF`. `status` `ACTIVE` \| `DEACTIVATED`. Unique `(organization_id, user_id)`. |

**Not in this table:** clients. Clients are not members.

`TenantGuard` + `tenantWhere(organizationId)` are the isolation primitives. `ClientAccessService` (assignments) is Phase 5.

---

## Phase 4 — Admin / subscriptions / audit

Implemented. Prisma migration `20260817220000_subscriptions_entitlements_audit`. No clients, meals, appointments, or AI generation tables.

| Table | Purpose |
|---|---|
| `plans` | Data-driven plans. Unique `slug`. Status `ACTIVE` \| `INACTIVE` \| `ARCHIVED`. Seeded Standard / Pro / Premium. |
| `features` | Catalog. Unique `key`. `value_type` `BOOLEAN` \| `LIMIT`. Global `status` is separate from org entitlement. Seeded `AI`, `AI_REQUEST_LIMIT`, and `CLIENT_LIMIT`. |
| `plan_features` | Unique `(plan_id, feature_id)`. `enabled` + optional `limit_value`. Optional `configuration` JSON unused in V1. |
| `subscriptions` | **At most one row per organization** (`organization_id` UNIQUE). Status `PENDING` \| `ACTIVE` \| `SUSPENDED` \| `CANCELLED` \| `EXPIRED`. Future billing columns present; **no payment processor**. Plan FK is `ON DELETE RESTRICT`. |
| `feature_overrides` | Unique `(organization_id, feature_id)`. Nullable `enabled` / `limit_value` inherit the other field from the plan. `reason` required. |
| `audit_logs` | Actor, organization, action, target, request id, result, sanitized metadata JSON, IP, user-agent. Written by `SecurityEventLogger`. |

Seeded AI limits follow the master specification: Standard AI disabled; Pro 300 requests; Premium 1000 requests.

Entitlement resolution is application code (`EntitlementService`), not a database rules engine. Existing subscriptions keep resolving after a plan is deactivated. Plans are not hard-deleted while referenced.

---

## Phase 5 — Dietitian, clients, practice operations

Implemented. Prisma migration `20260818010000_clients_practice_core`. No food, recipes, meal plans, tracking, messaging, documents, invoices, or AI generation tables.

| Table | Purpose |
|---|---|
| `clients` | Practice client record. `organization_id`. Lifecycle status. **Not** an org member |
| `client_accounts` | Link table only: `users` ↔ `clients`. **Not** a second auth system |
| `client_assignments` | Who may work this client. See below |
| `client_profiles` | Extended profile (goals context, allergies, preferences, notes) |
| `client_goals` | Goals used by lightweight Care Plan |
| `client_measurements` | Typed measurement rows (not one table per type). Internal units |
| `tags` | Organization-owned labels |
| `client_tags` | Many-to-many |
| `timeline_events` | Product history feed. See below |
| `assessment_templates` | Platform and/or practice templates |
| `assessments` | Completed/in-progress assessments |
| `appointments` | `timestamptz` start/end; org timezone for local interpretation |

### `clients` lifecycle

Status (enum naming may follow Prisma conventions):

- `PENDING`
- `ACTIVE`
- `INACTIVE`
- `ARCHIVED`

Inactive/archived clients remain stored. Portal access must not be granted to inactive/archived clients.

### `client_accounts`

**Only** the relationship between the authentication identity (`users`) and the practice client (`clients`).

```text
users  →  client_accounts  →  clients
```

Authentication remains entirely on `users`, `sessions`, and token infrastructure. Do **not** store passwords, sessions, or credentials on `client_accounts`.

Conceptual columns:

- `id`
- `user_id` (UNIQUE)
- `client_id` (UNIQUE)
- `status`
- `created_at`
- `activated_at`

### `client_assignments`

Conceptual columns:

- `id`
- `organization_id`
- `client_id`
- `organization_member_id` (the dietitian/staff member)
- `assigned_at`
- `assigned_by` (user id)
- `unassigned_at` (null = active)

Rules:

- OWNER sees all org clients regardless of assignment
- DIETITIAN sees clients with an active assignment to their membership
- STAFF visibility is permission-driven
- Reassignment: close previous row (`unassigned_at`), insert new row
- Keep history; do not destroy old assignment rows

### `timeline_events`

Conceptual columns:

- `id`, `organization_id`, `client_id`
- `type` (e.g. `CLIENT_CREATED`, `ASSESSMENT_COMPLETED`, `MEAL_PLAN_PUBLISHED`, …)
- `target_type` / `target_id` (optional reference to the real record)
- `actor_user_id` (nullable for system events)
- `occurred_at`
- small metadata JSON (never a full copy of the business record)

Timeline is a history index, not a substitute for assessments, meal plans, invoices, etc.

**Security:** `timeline_events` must not become a security bypass. Visibility uses the same organization and `ClientAccessService` rules as the underlying client. If Dietitian A cannot access Client B, they cannot retrieve Client B’s timeline. Timeline is not an authorization mechanism.

### `client_measurements`

One table for multiple measurement types. Do not create a new table per measurement. Do not build a generic medical measurement framework.

Conceptual columns:

- `id`
- `organization_id`
- `client_id`
- `type` (e.g. weight, height, waist, body fat, muscle mass)
- `value`
- `unit` (internal/normalized unit for that type)
- `measured_at`
- `recorded_by`
- `notes`

Authoritative values use normalized internal units (weight kg, height cm, food g, liquid ml, energy kcal). Display/input conversion is application-layer.

### `tags` / `client_tags`

Simple org-scoped labels. No tag rules engine. Used later for filters and dashboard.

### Care Plan

No dedicated clinical `care_plans` table in V1. The Care Plan UI reads `client_goals`, nutrition targets (on profile or goals), notes, habits (Phase 8), and the active meal plan (Phase 7).

### Practice settings expansion

Additional `organization_settings` columns in this phase as the dietitian settings UI lands: logo, email, phone, address, default appointment duration, reminder preferences, invoice settings, email branding. `locale` remains separate from `timezone`.

---

## Phase 6 — Food database

Implemented. Prisma migration `20260818020000_foods_nutrition` (`pg_trgm` + GIN on `foods.name_normalized`).

Global (platform) tables: `food_sources`, `foods`. Tenant table: `food_overrides.organization_id`.

| Table | Purpose |
|---|---|
| `food_sources` | Dataset identity (`key`, provider, `dataset_version`, license, attribution, `imported_at`, `last_import_report`, `status`) |
| `foods` | Global catalog. Unique `(food_source_id, source_food_id)`. Nutrients are nullable decimals (`null` = unknown, `0` = zero). Reference quantity is numeric g or ml — not “1 cup”. |
| `food_overrides` | Organization overlay only. Unique `(organization_id, food_id)`. Nullable nutrient columns; only non-null values replace global. `INACTIVE` + `deactivated_at` restores global effective values. **Never updates `foods`.** |

**Resolution:** global food → ACTIVE organization override → effective food. Member-specific override rows are not in V1.

**Dedup:** upsert on source identity. Do not merge similar names. Duplicate `source_food_id` in one import file: first row wins, later rows skipped.

**Calories:** Atwater check is diagnostic only; labeled kcal stays authoritative.

---

## Phase 7 — Recipes and meal plans

Recipes and meal plans are organization-owned. There is no global recipe catalog.

| Table | Purpose |
|---|---|
| `recipes` | Org-owned. `ACTIVE` / `ARCHIVED`. Soft-archive (`archived_at`). `servings` > 0. |
| `recipe_ingredients` | Whole-recipe food quantities. Units are mass/volume only (`g`/`kg`/`oz`/`lb`/`ml`/`l`/`fl_oz`). Never `serving`. `organization_id` even though `recipe_id` exists. |
| `meal_plans` | Both `organization_id` and `client_id`. Plan lifecycle: `DRAFT` / `ACTIVE` / `ARCHIVED`. Distinct from version publication status. |
| `meal_plan_versions` | Unique `(meal_plan_id, version_number)`. Status: `DRAFT` / `PUBLISHED` / `SUPERSEDED`. Partial unique indexes: at most one DRAFT and one PUBLISHED per plan. `snapshot` JSONB is written at publish and is the historical source of truth. |
| `meal_plan_days` | Belongs to a version. `day_number` plus optional `weekday` / `title` / `notes`. Supports Day 1 / Day 2 and Monday / Tuesday without a calendar engine. |
| `meals` | Belongs to a day. `sort_order` for reordering. |
| `meal_items` | Exactly one source: `FOOD` xor `RECIPE`. FOOD uses mass/volume units; RECIPE uses `unit = serving`. |

**Recipe quantity:** ingredient quantities are for the **whole recipe**. Total nutrition = sum of ingredients. Per serving = total / `recipes.servings`. A meal item `item_type = RECIPE`, `unit = serving`, `quantity = 2` means two servings (`perServing × 2`), not two copies of the whole recipe.

**Draft vs published nutrition:**

- Draft versions recalculate live through `FoodService.getEffective()` / `getEffectiveMany()` and `packages/nutrition`.
- Publishing writes an immutable `meal_plan_versions.snapshot` JSON (days, meals, items, names, quantities, and calculated nutrition). Later food-override or recipe edits do not change published or superseded snapshots.
- Child rows (`meal_plan_days` / `meals` / `meal_items`) remain for draft editing and as the clone source for a new draft. Published GET returns the snapshot (`immutable: true`), not a live recalculation.

Nutrition totals are derived. They are not stored as independently editable columns.

**Constraints (migration):** servings/quantity > 0; recipe ingredients cannot use `serving`; meal items FOOD xor RECIPE with matching units; unique version number per plan.

---

## Phase 8 — Client tracking

| Table | Purpose |
|---|---|
| `food_logs` | What the client consumed. `nutrition_snapshot` JSON preserves historical nutrition at log time. `tracking_date` is the organization-local calendar day. Archive via `status = ARCHIVED`. |
| `water_logs` | Normalized `amount_ml`. `tracking_date` for daily totals. |
| `exercise_logs` | Simple activity log (`activity_type`, `duration_minutes`, optional reported `calories_burned`). |
| `sleep_logs` | One row per client per local `date`. `bedtime` / `wake_time` timestamptz; `duration_minutes` derived when both provided. |
| `habit_logs` | Daily completion rows (`habit_key`, `habit_label`, `completed`, optional `value`). Unique per client/date/key. No separate habit catalog — reuse `client_goals` for targets, not duplicate habit definitions. |

**Food log snapshots:** at create/edit, `FoodService.getEffective()` + `packages/nutrition` write `nutrition_snapshot`. Daily totals sum snapshots, never live food rows. Later overrides do not mutate existing logs.

**Timezone:** `tracking_date` / `log_date` / sleep `date` are derived from event timestamps using `organization_settings.timezone` via `localDateKey()`.

Indexes: `(organization_id, client_id, tracking_date)` on food/water/exercise logs; `(organization_id, client_id, date)` on sleep; `(organization_id, client_id, log_date)` on habits.

---

## Phase 9 — Communication and documents

Implemented. Migration `20260818050000_messaging_documents`.

| Table | Purpose |
|---|---|
| `conversations` | One thread per `(organization_id, client_id)`. `last_message_at`, preview, archive support. |
| `messages` | Immutable text messages with `sender_user_id`, tenant columns. |
| `conversation_read_states` | Per-user read cursor (`last_read_at`) for unread counts across staff. |
| `documents` | File metadata + server-generated `storage_key`. Visibility `INTERNAL` \| `SHARED`. Archive, not hard-delete. |
| `notifications` | In-app only (`NEW_MESSAGE`, `DOCUMENT_SHARED`, `DOCUMENT_UPLOADED`). |

Timeline: `MESSAGE_SENT`, `DOCUMENT_UPLOADED`, `DOCUMENT_SHARED`, `DOCUMENT_ARCHIVED`.

---

## Phase 10 — Business

Migration: `20260818060000_invoices_tasks` (10 of 10 through Phase 10).

| Table | Purpose |
|---|---|
| `invoice_sequences` | One row per organization; atomic counter for concurrency-safe invoice numbers |
| `invoices` | `organization_id`, `client_id`. Statuses: DRAFT, ISSUED, SENT, PAID, OVERDUE, CANCELLED. Money as `DECIMAL(12,2)`. No payment provider. Archive rather than hard-delete issued/paid records |
| `invoice_items` | `organization_id`, line totals calculated server-side (`quantity` × `unit_price`) |
| `tasks` | `organization_id`, optional `client_id`, optional `assigned_member_id`. Internal practice tasks only |

Timeline: `INVOICE_CREATED`, `INVOICE_ISSUED`, `INVOICE_SENT`, `INVOICE_PAID`, `INVOICE_CANCELLED`, `TASK_CREATED`, `TASK_COMPLETED`, `TASK_CANCELLED`.

Notifications: `INVOICE_SENT`, `TASK_ASSIGNED` (in-app).

Indexes: `invoices(organization_id, status)`, `tasks(organization_id, assigned_member_id)`, due dates, client filters — see migration.

---

## Phase 11 — AI

Migrations: `20260818070000_ai`, `20260829183000_ai_usage_cost`, `20260829191000_ai_drafts`, `20260829200000_ai_draft_messages`.

| Table | Purpose |
|---|---|
| `ai_requests` | Audit/metadata per AI call: dietitian, user, optional client, action, provider, model, status, token counts, `cost_micros`, latency, error category. No long-term prompt/response storage |
| `ai_usage` | Monthly counters (`dietitian_account_id` + `period_key` YYYY-MM): `request_count`, `token_count`, `cost_micros` for `AI_REQUEST_LIMIT` and `AI_TOKEN_LIMIT` |
| `ai_drafts` | Last 50 replayable chats per practice: action, latest output JSON, and `messages` turns. No system prompt or chart dump |

Enums: `AiAction` (CLIENT_SUMMARY, MEAL_PLAN_ASSISTANCE, NUTRITION_ASSISTANCE, CONSULTATION_SUMMARY, MESSAGE_DRAFT), `AiRequestStatus` (REJECTED, PENDING, COMPLETED, FAILED).

Usage increment uses serializable transactions to prevent concurrent limit bypass.

---

## Phase 12 — Automation

| Table | Purpose |
|---|---|
| `automation_rules` | Org-scoped rules: trigger, action, validated configuration/conditions, status, audit fields |
| `automation_runs` | Execution history with idempotency key `(organization_id, trigger_key)` unique constraint |
| `automation_usage` | Monthly execution counter per org for `AUTOMATION_EXECUTION_LIMIT` |

Enums: `AutomationRuleStatus`, `AutomationTriggerType`, `AutomationActionType`, `AutomationRunStatus`. `NotificationType.AUTOMATION` added.

Features seeded: `AUTOMATION` (boolean), `AUTOMATION_RULE_LIMIT`, `AUTOMATION_EXECUTION_LIMIT`. Standard disabled; Pro 25 rules / 2000 exec per month; Premium 100 / 10000.

Execution uses serializable transactions for usage limits. Worker runs BullMQ `automation` queue sweep every 5 minutes.

---

## Entity checklist (eventual V1)

**Core:** `users`, `organizations`, `organization_members`, `clients`, `client_accounts`, `client_assignments`  
**Nutrition:** `foods`, `food_sources`, `food_overrides`, `recipes`, `recipe_ingredients`, `meal_plans`, `meal_plan_versions`, `meal_plan_days`, `meals`, `meal_items`  
**Tracking:** `client_measurements`, `food_logs`, `water_logs`, `exercise_logs`, `sleep_logs`, `habit_logs`  
**Practice:** `appointments`, `tasks`, `tags`, `client_tags`, `timeline_events`  
**Communication:** `conversations`, `messages`, `notifications`, `documents`  
**Business:** `invoices`, `invoice_items`  
**Platform:** `plans`, `subscriptions`, `features`, `plan_features`, `feature_overrides`, `ai_requests`, `ai_drafts`, `ai_usage`, `automation_rules`, `automation_runs`, `automation_usage`, `audit_logs`  
**Settings:** `organization_settings`  
**Auth extras:** `sessions`, tokens, `consents`  
**Assessments:** `assessment_templates`, `assessments`, `client_profiles`, `client_goals`

---

## Mandatory security tests (as modules land)

Tenant isolation is **release-blocking**. Automate at least:

1. Organization A cannot access Organization B records by guessed IDs
2. Organization A cannot modify Organization B records
3. Dietitian cannot access an unassigned client
4. Dietitian cannot modify an unassigned client’s data
5. Client cannot access another client
6. Client cannot modify another client’s data
7. Timeline events cannot bypass client authorization
8. Organization feature overrides cannot affect another organization
9. Organization food overrides cannot modify global food records
10. Invitation tokens cannot be reused
11. Expired invitation tokens cannot be used
12. Revoked sessions cannot authenticate
13. Archived/inactive clients cannot accidentally regain portal access
14. Admin impersonation preserves the real actor in audit logs (deferred — impersonation not implemented)

Automated consolidated suite (Phase 13): `apps/api/test/security-isolation.spec.ts`  
§87 acceptance workflow: `apps/api/test/acceptance-workflow.e2e.spec.ts`
