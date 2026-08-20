-- Phase 7: Drop Organization tenancy shells; dietitian_account_id becomes sole tenant key.
-- Backfill dietitian_account_id from organization_id when a matching dietitian_accounts row
-- exists (by id) OR organization_id equals dietitian_accounts.legacy_organization_id.

-- =============================================================================
-- 1. Backfill dietitian_account_id from organization_id
-- =============================================================================

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'invitation_tokens',
    'subscriptions',
    'feature_overrides',
    'audit_logs',
    'clients',
    'client_accounts',
    'client_assignments',
    'client_profiles',
    'client_goals',
    'tags',
    'client_tags',
    'timeline_events',
    'assessment_templates',
    'assessments',
    'client_measurements',
    'appointments',
    'food_overrides',
    'recipes',
    'recipe_ingredients',
    'meal_plans',
    'meal_plan_versions',
    'meal_plan_days',
    'meals',
    'meal_items',
    'food_logs',
    'water_logs',
    'exercise_logs',
    'sleep_logs',
    'habit_logs',
    'conversations',
    'messages',
    'conversation_read_states',
    'documents',
    'notifications',
    'invoices',
    'invoice_items',
    'tasks',
    'ai_requests',
    'automation_rules',
    'automation_runs'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format($sql$
      UPDATE %I AS src
      SET dietitian_account_id = COALESCE(
        (SELECT da.id FROM dietitian_accounts da WHERE da.id = src.organization_id),
        (SELECT da.id FROM dietitian_accounts da WHERE da.legacy_organization_id = src.organization_id)
      )
      WHERE src.dietitian_account_id IS NULL
        AND src.organization_id IS NOT NULL
        AND (
          EXISTS (SELECT 1 FROM dietitian_accounts da WHERE da.id = src.organization_id)
          OR EXISTS (SELECT 1 FROM dietitian_accounts da WHERE da.legacy_organization_id = src.organization_id)
        )
    $sql$, t);
  END LOOP;
END $$;

-- invoice_sequences / ai_usage / automation_usage are already keyed by dietitian_account_id.

-- =============================================================================
-- 2. ClientAssignment: organization_member_id -> user_id
-- =============================================================================

ALTER TABLE "client_assignments" ADD COLUMN IF NOT EXISTS "user_id" UUID;

UPDATE "client_assignments" AS ca
SET "user_id" = om."user_id"
FROM "organization_members" om
WHERE ca."organization_member_id" = om."id"
  AND ca."user_id" IS NULL;

ALTER TABLE "client_assignments" DROP CONSTRAINT IF EXISTS "client_assignments_organization_member_id_fkey";
DROP INDEX IF EXISTS "client_assignments_organization_member_id_unassigned_at_idx";
DROP INDEX IF EXISTS "client_assignments_organization_id_client_id_idx";

ALTER TABLE "client_assignments" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "client_assignments" DROP COLUMN IF EXISTS "organization_member_id";

ALTER TABLE "client_assignments"
  ADD CONSTRAINT "client_assignments_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "client_assignments_user_id_unassigned_at_idx"
  ON "client_assignments"("user_id", "unassigned_at");

-- =============================================================================
-- 3. Appointments / Tasks: assigned_member_id -> assigned_user_id
-- =============================================================================

ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "assigned_user_id" UUID;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "assigned_user_id" UUID;

UPDATE "appointments" AS a
SET "assigned_user_id" = om."user_id"
FROM "organization_members" om
WHERE a."assigned_member_id" = om."id"
  AND a."assigned_user_id" IS NULL;

UPDATE "tasks" AS t
SET "assigned_user_id" = om."user_id"
FROM "organization_members" om
WHERE t."assigned_member_id" = om."id"
  AND t."assigned_user_id" IS NULL;

ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS "appointments_assigned_member_id_fkey";
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_assigned_member_id_fkey";

DROP INDEX IF EXISTS "tasks_organization_id_assigned_member_id_idx";
DROP INDEX IF EXISTS "tasks_assigned_member_id_idx";

ALTER TABLE "appointments" DROP COLUMN IF EXISTS "assigned_member_id";
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "assigned_member_id";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'appointments_assigned_user_id_fkey'
  ) THEN
    ALTER TABLE "appointments"
      ADD CONSTRAINT "appointments_assigned_user_id_fkey"
      FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_assigned_user_id_fkey'
  ) THEN
    ALTER TABLE "tasks"
      ADD CONSTRAINT "tasks_assigned_user_id_fkey"
      FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "appointments_assigned_user_id_idx" ON "appointments"("assigned_user_id");
CREATE INDEX IF NOT EXISTS "tasks_assigned_user_id_idx" ON "tasks"("assigned_user_id");
CREATE INDEX IF NOT EXISTS "tasks_dietitian_account_id_assigned_user_id_idx"
  ON "tasks"("dietitian_account_id", "assigned_user_id");

-- =============================================================================
-- 4. Make dietitian_account_id NOT NULL (tenant-owned tables)
-- =============================================================================

-- Drop orphan rows that could not be backfilled (e.g. legacy platform assessment
-- templates with null organization_id / dietitian_account_id).
DELETE FROM "assessments" WHERE "dietitian_account_id" IS NULL;
DELETE FROM "assessment_templates" WHERE "dietitian_account_id" IS NULL;
DELETE FROM "automation_runs" WHERE "dietitian_account_id" IS NULL;
DELETE FROM "automation_rules" WHERE "dietitian_account_id" IS NULL;
DELETE FROM "ai_requests" WHERE "dietitian_account_id" IS NULL;
DELETE FROM "tasks" WHERE "dietitian_account_id" IS NULL;
DELETE FROM "invoice_items" WHERE "dietitian_account_id" IS NULL;
DELETE FROM "invoices" WHERE "dietitian_account_id" IS NULL;
DELETE FROM "notifications" WHERE "dietitian_account_id" IS NULL;
DELETE FROM "documents" WHERE "dietitian_account_id" IS NULL;
DELETE FROM "conversation_read_states" WHERE "dietitian_account_id" IS NULL;
DELETE FROM "messages" WHERE "dietitian_account_id" IS NULL;
DELETE FROM "conversations" WHERE "dietitian_account_id" IS NULL;
DELETE FROM "habit_logs" WHERE "dietitian_account_id" IS NULL;
DELETE FROM "sleep_logs" WHERE "dietitian_account_id" IS NULL;
DELETE FROM "exercise_logs" WHERE "dietitian_account_id" IS NULL;
DELETE FROM "water_logs" WHERE "dietitian_account_id" IS NULL;
DELETE FROM "food_logs" WHERE "dietitian_account_id" IS NULL;
DELETE FROM "meal_items" WHERE "dietitian_account_id" IS NULL;
DELETE FROM "meals" WHERE "dietitian_account_id" IS NULL;
DELETE FROM "meal_plan_days" WHERE "dietitian_account_id" IS NULL;
DELETE FROM "meal_plan_versions" WHERE "dietitian_account_id" IS NULL;
DELETE FROM "meal_plans" WHERE "dietitian_account_id" IS NULL;
DELETE FROM "recipe_ingredients" WHERE "dietitian_account_id" IS NULL;
DELETE FROM "recipes" WHERE "dietitian_account_id" IS NULL;
DELETE FROM "food_overrides" WHERE "dietitian_account_id" IS NULL;
DELETE FROM "appointments" WHERE "dietitian_account_id" IS NULL;
DELETE FROM "client_measurements" WHERE "dietitian_account_id" IS NULL;
DELETE FROM "timeline_events" WHERE "dietitian_account_id" IS NULL;
DELETE FROM "client_tags" WHERE "dietitian_account_id" IS NULL;
DELETE FROM "tags" WHERE "dietitian_account_id" IS NULL;
DELETE FROM "client_goals" WHERE "dietitian_account_id" IS NULL;
DELETE FROM "client_profiles" WHERE "dietitian_account_id" IS NULL;
DELETE FROM "client_assignments" WHERE "dietitian_account_id" IS NULL;
DELETE FROM "client_accounts" WHERE "dietitian_account_id" IS NULL;
DELETE FROM "clients" WHERE "dietitian_account_id" IS NULL;
DELETE FROM "feature_overrides" WHERE "dietitian_account_id" IS NULL;
DELETE FROM "subscriptions" WHERE "dietitian_account_id" IS NULL;

-- Assessment templates: SetNull -> Restrict once required
ALTER TABLE "assessment_templates" DROP CONSTRAINT IF EXISTS "assessment_templates_dietitian_account_id_fkey";

DO $$
DECLARE
  t TEXT;
  required_tables TEXT[] := ARRAY[
    'subscriptions',
    'feature_overrides',
    'clients',
    'client_accounts',
    'client_assignments',
    'client_profiles',
    'client_goals',
    'tags',
    'client_tags',
    'timeline_events',
    'assessment_templates',
    'assessments',
    'client_measurements',
    'appointments',
    'food_overrides',
    'recipes',
    'recipe_ingredients',
    'meal_plans',
    'meal_plan_versions',
    'meal_plan_days',
    'meals',
    'meal_items',
    'food_logs',
    'water_logs',
    'exercise_logs',
    'sleep_logs',
    'habit_logs',
    'conversations',
    'messages',
    'conversation_read_states',
    'documents',
    'notifications',
    'invoices',
    'invoice_items',
    'tasks',
    'ai_requests',
    'automation_rules',
    'automation_runs'
  ];
BEGIN
  FOREACH t IN ARRAY required_tables LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN "dietitian_account_id" SET NOT NULL', t);
  END LOOP;
END $$;

ALTER TABLE "assessment_templates"
  ADD CONSTRAINT "assessment_templates_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- 5. Drop remaining organization_id FKs (Phase 1 already dropped most)
-- =============================================================================

ALTER TABLE "invitation_tokens" DROP CONSTRAINT IF EXISTS "invitation_tokens_organization_id_fkey";
ALTER TABLE "subscriptions" DROP CONSTRAINT IF EXISTS "subscriptions_organization_id_fkey";
ALTER TABLE "feature_overrides" DROP CONSTRAINT IF EXISTS "feature_overrides_organization_id_fkey";
ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_organization_id_fkey";
ALTER TABLE "clients" DROP CONSTRAINT IF EXISTS "clients_organization_id_fkey";
ALTER TABLE "client_accounts" DROP CONSTRAINT IF EXISTS "client_accounts_organization_id_fkey";
ALTER TABLE "client_assignments" DROP CONSTRAINT IF EXISTS "client_assignments_organization_id_fkey";
ALTER TABLE "client_profiles" DROP CONSTRAINT IF EXISTS "client_profiles_organization_id_fkey";
ALTER TABLE "client_goals" DROP CONSTRAINT IF EXISTS "client_goals_organization_id_fkey";
ALTER TABLE "tags" DROP CONSTRAINT IF EXISTS "tags_organization_id_fkey";
ALTER TABLE "client_tags" DROP CONSTRAINT IF EXISTS "client_tags_organization_id_fkey";
ALTER TABLE "timeline_events" DROP CONSTRAINT IF EXISTS "timeline_events_organization_id_fkey";
ALTER TABLE "assessment_templates" DROP CONSTRAINT IF EXISTS "assessment_templates_organization_id_fkey";
ALTER TABLE "assessments" DROP CONSTRAINT IF EXISTS "assessments_organization_id_fkey";
ALTER TABLE "client_measurements" DROP CONSTRAINT IF EXISTS "client_measurements_organization_id_fkey";
ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS "appointments_organization_id_fkey";
ALTER TABLE "food_overrides" DROP CONSTRAINT IF EXISTS "food_overrides_organization_id_fkey";
ALTER TABLE "recipes" DROP CONSTRAINT IF EXISTS "recipes_organization_id_fkey";
ALTER TABLE "recipe_ingredients" DROP CONSTRAINT IF EXISTS "recipe_ingredients_organization_id_fkey";
ALTER TABLE "meal_plans" DROP CONSTRAINT IF EXISTS "meal_plans_organization_id_fkey";
ALTER TABLE "meal_plan_versions" DROP CONSTRAINT IF EXISTS "meal_plan_versions_organization_id_fkey";
ALTER TABLE "meal_plan_days" DROP CONSTRAINT IF EXISTS "meal_plan_days_organization_id_fkey";
ALTER TABLE "meals" DROP CONSTRAINT IF EXISTS "meals_organization_id_fkey";
ALTER TABLE "meal_items" DROP CONSTRAINT IF EXISTS "meal_items_organization_id_fkey";
ALTER TABLE "food_logs" DROP CONSTRAINT IF EXISTS "food_logs_organization_id_fkey";
ALTER TABLE "water_logs" DROP CONSTRAINT IF EXISTS "water_logs_organization_id_fkey";
ALTER TABLE "exercise_logs" DROP CONSTRAINT IF EXISTS "exercise_logs_organization_id_fkey";
ALTER TABLE "sleep_logs" DROP CONSTRAINT IF EXISTS "sleep_logs_organization_id_fkey";
ALTER TABLE "habit_logs" DROP CONSTRAINT IF EXISTS "habit_logs_organization_id_fkey";
ALTER TABLE "conversations" DROP CONSTRAINT IF EXISTS "conversations_organization_id_fkey";
ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "messages_organization_id_fkey";
ALTER TABLE "conversation_read_states" DROP CONSTRAINT IF EXISTS "conversation_read_states_organization_id_fkey";
ALTER TABLE "documents" DROP CONSTRAINT IF EXISTS "documents_organization_id_fkey";
ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_organization_id_fkey";
ALTER TABLE "invoice_sequences" DROP CONSTRAINT IF EXISTS "invoice_sequences_organization_id_fkey";
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_organization_id_fkey";
ALTER TABLE "invoice_items" DROP CONSTRAINT IF EXISTS "invoice_items_organization_id_fkey";
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_organization_id_fkey";
ALTER TABLE "ai_usage" DROP CONSTRAINT IF EXISTS "ai_usage_organization_id_fkey";
ALTER TABLE "ai_requests" DROP CONSTRAINT IF EXISTS "ai_requests_organization_id_fkey";
ALTER TABLE "automation_rules" DROP CONSTRAINT IF EXISTS "automation_rules_organization_id_fkey";
ALTER TABLE "automation_runs" DROP CONSTRAINT IF EXISTS "automation_runs_organization_id_fkey";
ALTER TABLE "automation_usage" DROP CONSTRAINT IF EXISTS "automation_usage_organization_id_fkey";

-- =============================================================================
-- 6. Drop organization_id unique indexes / columns
-- =============================================================================

DROP INDEX IF EXISTS "feature_overrides_organization_id_feature_id_key";
DROP INDEX IF EXISTS "clients_organization_id_code_key";
DROP INDEX IF EXISTS "tags_organization_id_name_key";
DROP INDEX IF EXISTS "food_overrides_organization_id_food_id_key";
DROP INDEX IF EXISTS "sleep_logs_organization_id_client_id_date_key";
DROP INDEX IF EXISTS "habit_logs_organization_id_client_id_habit_key_log_date_key";
DROP INDEX IF EXISTS "conversations_organization_id_client_id_key";
DROP INDEX IF EXISTS "documents_organization_id_storage_key_key";
DROP INDEX IF EXISTS "invoices_organization_id_invoice_number_key";
DROP INDEX IF EXISTS "automation_runs_organization_id_trigger_key_key";

ALTER TABLE "invitation_tokens" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "feature_overrides" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "clients" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "client_accounts" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "client_assignments" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "client_profiles" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "client_goals" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "tags" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "client_tags" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "timeline_events" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "assessment_templates" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "assessments" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "client_measurements" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "appointments" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "food_overrides" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "recipes" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "recipe_ingredients" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "meal_plans" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "meal_plan_versions" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "meal_plan_days" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "meals" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "meal_items" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "food_logs" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "water_logs" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "exercise_logs" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "sleep_logs" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "habit_logs" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "conversations" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "messages" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "conversation_read_states" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "documents" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "notifications" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "invoice_sequences" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "invoices" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "invoice_items" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "ai_usage" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "ai_requests" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "automation_rules" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "automation_runs" DROP COLUMN IF EXISTS "organization_id";
ALTER TABLE "automation_usage" DROP COLUMN IF EXISTS "organization_id";

-- =============================================================================
-- 7. Drop organization shell tables
-- =============================================================================

DROP TABLE IF EXISTS "organization_members" CASCADE;
DROP TABLE IF EXISTS "organization_settings" CASCADE;
DROP TABLE IF EXISTS "organizations" CASCADE;

DROP TYPE IF EXISTS "OrganizationRole";
DROP TYPE IF EXISTS "MembershipStatus";
DROP TYPE IF EXISTS "OrganizationStatus";

-- =============================================================================
-- 8. Drop DietitianAccount.legacy_organization_id
-- =============================================================================

DROP INDEX IF EXISTS "dietitian_accounts_legacy_organization_id_idx";
ALTER TABLE "dietitian_accounts" DROP COLUMN IF EXISTS "legacy_organization_id";
