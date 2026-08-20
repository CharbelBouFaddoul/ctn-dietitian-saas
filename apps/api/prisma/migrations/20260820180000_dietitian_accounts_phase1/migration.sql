-- Phase 1: DietitianAccount tenancy DDL.
-- Data backfill is performed by DietitianAccountBackfillService (TypeScript).
-- Legacy organizations / organization_members / organization_id columns are retained.

-- =============================================================================
-- 1. Enum + core tables
-- =============================================================================

CREATE TYPE "DietitianAccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

CREATE TABLE "dietitian_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "DietitianAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "phone" TEXT,
    "professional_title" TEXT,
    "specialization" TEXT,
    "country" TEXT,
    "photo_storage_key" TEXT,
    "legacy_organization_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "archived_at" TIMESTAMPTZ,
    "suspended_at" TIMESTAMPTZ,
    CONSTRAINT "dietitian_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dietitian_accounts_user_id_key" ON "dietitian_accounts"("user_id");
CREATE UNIQUE INDEX "dietitian_accounts_slug_key" ON "dietitian_accounts"("slug");
CREATE INDEX "dietitian_accounts_legacy_organization_id_idx" ON "dietitian_accounts"("legacy_organization_id");
CREATE INDEX "dietitian_accounts_status_idx" ON "dietitian_accounts"("status");

ALTER TABLE "dietitian_accounts"
  ADD CONSTRAINT "dietitian_accounts_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "dietitian_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dietitian_account_id" UUID NOT NULL,
    "timezone" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "weight_unit" "WeightUnit" NOT NULL,
    "height_unit" "HeightUnit" NOT NULL,
    "date_format" "DateFormat" NOT NULL,
    "practice_name" TEXT,
    "logo_storage_key" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "city" TEXT,
    "region" TEXT,
    "postal_code" TEXT,
    "country" TEXT,
    "default_appointment_minutes" INTEGER NOT NULL DEFAULT 60,
    "reminder_email_enabled" BOOLEAN NOT NULL DEFAULT true,
    "reminder_hours_before" INTEGER NOT NULL DEFAULT 24,
    "invoice_default_due_days" INTEGER NOT NULL DEFAULT 14,
    "invoice_footer" TEXT,
    "email_from_name" TEXT,
    "email_reply_to" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "dietitian_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dietitian_settings_dietitian_account_id_key" ON "dietitian_settings"("dietitian_account_id");

ALTER TABLE "dietitian_settings"
  ADD CONSTRAINT "dietitian_settings_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- 2. Drop Organization FKs from clinical / tenant tables (keep columns)
-- =============================================================================

ALTER TABLE "invitation_tokens" DROP CONSTRAINT IF EXISTS "invitation_tokens_organization_id_fkey";
ALTER TABLE "subscriptions" DROP CONSTRAINT IF EXISTS "subscriptions_organization_id_fkey";
ALTER TABLE "feature_overrides" DROP CONSTRAINT IF EXISTS "feature_overrides_organization_id_fkey";
ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_organization_id_fkey";
ALTER TABLE "clients" DROP CONSTRAINT IF EXISTS "clients_organization_id_fkey";
ALTER TABLE "tags" DROP CONSTRAINT IF EXISTS "tags_organization_id_fkey";
ALTER TABLE "timeline_events" DROP CONSTRAINT IF EXISTS "timeline_events_organization_id_fkey";
ALTER TABLE "assessment_templates" DROP CONSTRAINT IF EXISTS "assessment_templates_organization_id_fkey";
ALTER TABLE "assessments" DROP CONSTRAINT IF EXISTS "assessments_organization_id_fkey";
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
ALTER TABLE "documents" DROP CONSTRAINT IF EXISTS "documents_organization_id_fkey";
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_organization_id_fkey";
ALTER TABLE "invoice_items" DROP CONSTRAINT IF EXISTS "invoice_items_organization_id_fkey";
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_organization_id_fkey";
ALTER TABLE "ai_requests" DROP CONSTRAINT IF EXISTS "ai_requests_organization_id_fkey";
ALTER TABLE "automation_rules" DROP CONSTRAINT IF EXISTS "automation_rules_organization_id_fkey";
ALTER TABLE "automation_runs" DROP CONSTRAINT IF EXISTS "automation_runs_organization_id_fkey";

-- =============================================================================
-- 3. Subscription: dietitian_account_id primary unique; organization_id legacy
-- =============================================================================

DROP INDEX IF EXISTS "subscriptions_organization_id_key";
ALTER TABLE "subscriptions" ALTER COLUMN "organization_id" DROP NOT NULL;
ALTER TABLE "subscriptions" ADD COLUMN "dietitian_account_id" UUID;
CREATE UNIQUE INDEX "subscriptions_dietitian_account_id_key" ON "subscriptions"("dietitian_account_id");
CREATE INDEX "subscriptions_organization_id_idx" ON "subscriptions"("organization_id");

-- =============================================================================
-- 4. Add nullable dietitian_account_id (+ assigned_user_id) columns
-- =============================================================================

ALTER TABLE "invitation_tokens" ADD COLUMN "dietitian_account_id" UUID;
ALTER TABLE "feature_overrides" ADD COLUMN "dietitian_account_id" UUID;
ALTER TABLE "audit_logs" ADD COLUMN "dietitian_account_id" UUID;
ALTER TABLE "clients" ADD COLUMN "dietitian_account_id" UUID;
ALTER TABLE "client_accounts" ADD COLUMN "dietitian_account_id" UUID;
ALTER TABLE "client_assignments" ADD COLUMN "dietitian_account_id" UUID;
ALTER TABLE "client_profiles" ADD COLUMN "dietitian_account_id" UUID;
ALTER TABLE "client_goals" ADD COLUMN "dietitian_account_id" UUID;
ALTER TABLE "tags" ADD COLUMN "dietitian_account_id" UUID;
ALTER TABLE "client_tags" ADD COLUMN "dietitian_account_id" UUID;
ALTER TABLE "timeline_events" ADD COLUMN "dietitian_account_id" UUID;
ALTER TABLE "assessment_templates" ADD COLUMN "dietitian_account_id" UUID;
ALTER TABLE "assessments" ADD COLUMN "dietitian_account_id" UUID;
ALTER TABLE "client_measurements" ADD COLUMN "dietitian_account_id" UUID;
ALTER TABLE "appointments" ADD COLUMN "dietitian_account_id" UUID;
ALTER TABLE "appointments" ADD COLUMN "assigned_user_id" UUID;
ALTER TABLE "food_overrides" ADD COLUMN "dietitian_account_id" UUID;
ALTER TABLE "recipes" ADD COLUMN "dietitian_account_id" UUID;
ALTER TABLE "recipe_ingredients" ADD COLUMN "dietitian_account_id" UUID;
ALTER TABLE "meal_plans" ADD COLUMN "dietitian_account_id" UUID;
ALTER TABLE "meal_plan_versions" ADD COLUMN "dietitian_account_id" UUID;
ALTER TABLE "meal_plan_days" ADD COLUMN "dietitian_account_id" UUID;
ALTER TABLE "meals" ADD COLUMN "dietitian_account_id" UUID;
ALTER TABLE "meal_items" ADD COLUMN "dietitian_account_id" UUID;
ALTER TABLE "food_logs" ADD COLUMN "dietitian_account_id" UUID;
ALTER TABLE "water_logs" ADD COLUMN "dietitian_account_id" UUID;
ALTER TABLE "exercise_logs" ADD COLUMN "dietitian_account_id" UUID;
ALTER TABLE "sleep_logs" ADD COLUMN "dietitian_account_id" UUID;
ALTER TABLE "habit_logs" ADD COLUMN "dietitian_account_id" UUID;
ALTER TABLE "conversations" ADD COLUMN "dietitian_account_id" UUID;
ALTER TABLE "messages" ADD COLUMN "dietitian_account_id" UUID;
ALTER TABLE "conversation_read_states" ADD COLUMN "dietitian_account_id" UUID;
ALTER TABLE "documents" ADD COLUMN "dietitian_account_id" UUID;
ALTER TABLE "notifications" ADD COLUMN "dietitian_account_id" UUID;
ALTER TABLE "invoices" ADD COLUMN "dietitian_account_id" UUID;
ALTER TABLE "invoice_items" ADD COLUMN "dietitian_account_id" UUID;
ALTER TABLE "tasks" ADD COLUMN "dietitian_account_id" UUID;
ALTER TABLE "tasks" ADD COLUMN "assigned_user_id" UUID;
ALTER TABLE "ai_requests" ADD COLUMN "dietitian_account_id" UUID;
ALTER TABLE "automation_rules" ADD COLUMN "dietitian_account_id" UUID;
ALTER TABLE "automation_runs" ADD COLUMN "dietitian_account_id" UUID;

-- =============================================================================
-- 5. Rebuild invoice_sequences / ai_usage / automation_usage (new PKs)
-- =============================================================================

ALTER TABLE "invoice_sequences" RENAME TO "invoice_sequences_legacy";
ALTER TABLE "invoice_sequences_legacy" RENAME CONSTRAINT "invoice_sequences_pkey" TO "invoice_sequences_legacy_pkey";
ALTER TABLE "invoice_sequences_legacy" DROP CONSTRAINT IF EXISTS "invoice_sequences_organization_id_fkey";

CREATE TABLE "invoice_sequences" (
    "dietitian_account_id" UUID NOT NULL,
    "organization_id" UUID,
    "next_number" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "invoice_sequences_pkey" PRIMARY KEY ("dietitian_account_id")
);

CREATE INDEX "invoice_sequences_organization_id_idx" ON "invoice_sequences"("organization_id");

ALTER TABLE "invoice_sequences"
  ADD CONSTRAINT "invoice_sequences_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_usage" RENAME TO "ai_usage_legacy";
ALTER TABLE "ai_usage_legacy" RENAME CONSTRAINT "ai_usage_pkey" TO "ai_usage_legacy_pkey";
ALTER TABLE "ai_usage_legacy" DROP CONSTRAINT IF EXISTS "ai_usage_organization_id_fkey";
ALTER INDEX IF EXISTS "ai_usage_organization_id_idx" RENAME TO "ai_usage_legacy_organization_id_idx";

CREATE TABLE "ai_usage" (
    "dietitian_account_id" UUID NOT NULL,
    "organization_id" UUID,
    "period_key" TEXT NOT NULL,
    "request_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("dietitian_account_id", "period_key")
);

CREATE INDEX "ai_usage_dietitian_account_id_idx" ON "ai_usage"("dietitian_account_id");
CREATE INDEX "ai_usage_organization_id_idx" ON "ai_usage"("organization_id");

ALTER TABLE "ai_usage"
  ADD CONSTRAINT "ai_usage_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "automation_usage" RENAME TO "automation_usage_legacy";
ALTER TABLE "automation_usage_legacy" RENAME CONSTRAINT "automation_usage_pkey" TO "automation_usage_legacy_pkey";
ALTER TABLE "automation_usage_legacy" DROP CONSTRAINT IF EXISTS "automation_usage_organization_id_fkey";
ALTER INDEX IF EXISTS "automation_usage_organization_id_idx" RENAME TO "automation_usage_legacy_organization_id_idx";

CREATE TABLE "automation_usage" (
    "dietitian_account_id" UUID NOT NULL,
    "organization_id" UUID,
    "period_key" TEXT NOT NULL,
    "execution_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "automation_usage_pkey" PRIMARY KEY ("dietitian_account_id", "period_key")
);

CREATE INDEX "automation_usage_dietitian_account_id_idx" ON "automation_usage"("dietitian_account_id");
CREATE INDEX "automation_usage_organization_id_idx" ON "automation_usage"("organization_id");

ALTER TABLE "automation_usage"
  ADD CONSTRAINT "automation_usage_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- 6. ClientAccount: drop user_id unique; multi-link indexes
-- =============================================================================

DROP INDEX IF EXISTS "client_accounts_user_id_key";
CREATE INDEX "client_accounts_user_id_idx" ON "client_accounts"("user_id");
CREATE UNIQUE INDEX "client_accounts_user_id_dietitian_account_id_key" ON "client_accounts"("user_id", "dietitian_account_id");
CREATE INDEX "client_accounts_dietitian_account_id_idx" ON "client_accounts"("dietitian_account_id");

-- =============================================================================
-- 7. Foreign keys to dietitian_accounts + assigned_user_id
-- =============================================================================

ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invitation_tokens"
  ADD CONSTRAINT "invitation_tokens_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "feature_overrides"
  ADD CONSTRAINT "feature_overrides_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "clients"
  ADD CONSTRAINT "clients_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "client_accounts"
  ADD CONSTRAINT "client_accounts_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "client_assignments"
  ADD CONSTRAINT "client_assignments_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "client_profiles"
  ADD CONSTRAINT "client_profiles_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "client_goals"
  ADD CONSTRAINT "client_goals_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tags"
  ADD CONSTRAINT "tags_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "client_tags"
  ADD CONSTRAINT "client_tags_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "timeline_events"
  ADD CONSTRAINT "timeline_events_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "assessment_templates"
  ADD CONSTRAINT "assessment_templates_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "assessments"
  ADD CONSTRAINT "assessments_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "client_measurements"
  ADD CONSTRAINT "client_measurements_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_assigned_user_id_fkey"
  FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "food_overrides"
  ADD CONSTRAINT "food_overrides_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recipes"
  ADD CONSTRAINT "recipes_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "recipe_ingredients"
  ADD CONSTRAINT "recipe_ingredients_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "meal_plans"
  ADD CONSTRAINT "meal_plans_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "meal_plan_versions"
  ADD CONSTRAINT "meal_plan_versions_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "meal_plan_days"
  ADD CONSTRAINT "meal_plan_days_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "meals"
  ADD CONSTRAINT "meals_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "meal_items"
  ADD CONSTRAINT "meal_items_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "food_logs"
  ADD CONSTRAINT "food_logs_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "water_logs"
  ADD CONSTRAINT "water_logs_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exercise_logs"
  ADD CONSTRAINT "exercise_logs_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sleep_logs"
  ADD CONSTRAINT "sleep_logs_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "habit_logs"
  ADD CONSTRAINT "habit_logs_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "conversation_read_states"
  ADD CONSTRAINT "conversation_read_states_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "documents"
  ADD CONSTRAINT "documents_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invoice_items"
  ADD CONSTRAINT "invoice_items_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_assigned_user_id_fkey"
  FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ai_requests"
  ADD CONSTRAINT "ai_requests_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "automation_rules"
  ADD CONSTRAINT "automation_rules_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "automation_runs"
  ADD CONSTRAINT "automation_runs_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- 8. Parallel unique indexes + supporting indexes
-- =============================================================================

CREATE INDEX "invitation_tokens_dietitian_account_id_idx" ON "invitation_tokens"("dietitian_account_id");
CREATE INDEX "feature_overrides_dietitian_account_id_idx" ON "feature_overrides"("dietitian_account_id");
CREATE UNIQUE INDEX "feature_overrides_dietitian_account_id_feature_id_key" ON "feature_overrides"("dietitian_account_id", "feature_id");
CREATE INDEX "audit_logs_dietitian_account_id_idx" ON "audit_logs"("dietitian_account_id");

CREATE INDEX "clients_dietitian_account_id_status_idx" ON "clients"("dietitian_account_id", "status");
CREATE INDEX "clients_dietitian_account_id_last_name_idx" ON "clients"("dietitian_account_id", "last_name");
CREATE UNIQUE INDEX "clients_dietitian_account_id_code_key" ON "clients"("dietitian_account_id", "code");

CREATE INDEX "client_assignments_dietitian_account_id_client_id_idx" ON "client_assignments"("dietitian_account_id", "client_id");
CREATE INDEX "client_profiles_dietitian_account_id_idx" ON "client_profiles"("dietitian_account_id");
CREATE INDEX "client_goals_dietitian_account_id_client_id_idx" ON "client_goals"("dietitian_account_id", "client_id");

CREATE UNIQUE INDEX "tags_dietitian_account_id_name_key" ON "tags"("dietitian_account_id", "name");
CREATE INDEX "client_tags_dietitian_account_id_tag_id_idx" ON "client_tags"("dietitian_account_id", "tag_id");

CREATE INDEX "timeline_events_dietitian_account_id_client_id_occurred_at_idx" ON "timeline_events"("dietitian_account_id", "client_id", "occurred_at");
CREATE INDEX "assessment_templates_dietitian_account_id_status_idx" ON "assessment_templates"("dietitian_account_id", "status");
CREATE INDEX "assessments_dietitian_account_id_client_id_idx" ON "assessments"("dietitian_account_id", "client_id");
CREATE INDEX "client_measurements_dietitian_account_id_client_id_idx" ON "client_measurements"("dietitian_account_id", "client_id");

CREATE INDEX "appointments_dietitian_account_id_start_at_idx" ON "appointments"("dietitian_account_id", "start_at");
CREATE INDEX "appointments_dietitian_account_id_client_id_idx" ON "appointments"("dietitian_account_id", "client_id");
CREATE INDEX "appointments_assigned_user_id_idx" ON "appointments"("assigned_user_id");

CREATE UNIQUE INDEX "food_overrides_dietitian_account_id_food_id_key" ON "food_overrides"("dietitian_account_id", "food_id");
CREATE INDEX "food_overrides_dietitian_account_id_status_idx" ON "food_overrides"("dietitian_account_id", "status");

CREATE INDEX "recipes_dietitian_account_id_status_name_idx" ON "recipes"("dietitian_account_id", "status", "name");
CREATE INDEX "recipe_ingredients_dietitian_account_id_recipe_id_idx" ON "recipe_ingredients"("dietitian_account_id", "recipe_id");

CREATE INDEX "meal_plans_dietitian_account_id_client_id_status_idx" ON "meal_plans"("dietitian_account_id", "client_id", "status");
CREATE INDEX "meal_plans_dietitian_account_id_status_idx" ON "meal_plans"("dietitian_account_id", "status");
CREATE INDEX "meal_plan_versions_dietitian_account_id_meal_plan_id_status_idx" ON "meal_plan_versions"("dietitian_account_id", "meal_plan_id", "status");
CREATE INDEX "meal_plan_days_dietitian_account_id_meal_plan_version_id_idx" ON "meal_plan_days"("dietitian_account_id", "meal_plan_version_id");
CREATE INDEX "meals_dietitian_account_id_meal_plan_day_id_sort_order_idx" ON "meals"("dietitian_account_id", "meal_plan_day_id", "sort_order");
CREATE INDEX "meal_items_dietitian_account_id_meal_id_sort_order_idx" ON "meal_items"("dietitian_account_id", "meal_id", "sort_order");

CREATE INDEX "food_logs_dietitian_account_id_client_id_tracking_date_idx" ON "food_logs"("dietitian_account_id", "client_id", "tracking_date");
CREATE INDEX "food_logs_dietitian_account_id_client_id_consumed_at_idx" ON "food_logs"("dietitian_account_id", "client_id", "consumed_at");
CREATE INDEX "water_logs_dietitian_account_id_client_id_tracking_date_idx" ON "water_logs"("dietitian_account_id", "client_id", "tracking_date");
CREATE INDEX "exercise_logs_dietitian_account_id_client_id_tracking_date_idx" ON "exercise_logs"("dietitian_account_id", "client_id", "tracking_date");
CREATE UNIQUE INDEX "sleep_logs_dietitian_account_id_client_id_date_key" ON "sleep_logs"("dietitian_account_id", "client_id", "date");
CREATE INDEX "sleep_logs_dietitian_account_id_client_id_date_idx" ON "sleep_logs"("dietitian_account_id", "client_id", "date");
CREATE UNIQUE INDEX "habit_logs_dietitian_account_id_client_id_habit_key_log_date_key" ON "habit_logs"("dietitian_account_id", "client_id", "habit_key", "log_date");
CREATE INDEX "habit_logs_dietitian_account_id_client_id_log_date_idx" ON "habit_logs"("dietitian_account_id", "client_id", "log_date");

CREATE UNIQUE INDEX "conversations_dietitian_account_id_client_id_key" ON "conversations"("dietitian_account_id", "client_id");
CREATE INDEX "conversations_dietitian_account_id_last_message_at_idx" ON "conversations"("dietitian_account_id", "last_message_at");
CREATE INDEX "conversations_dietitian_account_id_client_id_status_idx" ON "conversations"("dietitian_account_id", "client_id", "status");
CREATE INDEX "messages_dietitian_account_id_client_id_created_at_idx" ON "messages"("dietitian_account_id", "client_id", "created_at");
CREATE INDEX "conversation_read_states_dietitian_account_id_reader_user_id_idx" ON "conversation_read_states"("dietitian_account_id", "reader_user_id");

CREATE UNIQUE INDEX "documents_dietitian_account_id_storage_key_key" ON "documents"("dietitian_account_id", "storage_key");
CREATE INDEX "documents_dietitian_account_id_client_id_status_created_at_idx" ON "documents"("dietitian_account_id", "client_id", "status", "created_at");
CREATE INDEX "documents_dietitian_account_id_client_id_visibility_status_idx" ON "documents"("dietitian_account_id", "client_id", "visibility", "status");

CREATE INDEX "notifications_dietitian_account_id_user_id_read_at_created_at_idx" ON "notifications"("dietitian_account_id", "user_id", "read_at", "created_at");

CREATE UNIQUE INDEX "invoices_dietitian_account_id_invoice_number_key" ON "invoices"("dietitian_account_id", "invoice_number");
CREATE INDEX "invoices_dietitian_account_id_idx" ON "invoices"("dietitian_account_id");
CREATE INDEX "invoices_dietitian_account_id_status_idx" ON "invoices"("dietitian_account_id", "status");
CREATE INDEX "invoices_dietitian_account_id_client_id_idx" ON "invoices"("dietitian_account_id", "client_id");
CREATE INDEX "invoice_items_dietitian_account_id_idx" ON "invoice_items"("dietitian_account_id");

CREATE INDEX "tasks_dietitian_account_id_idx" ON "tasks"("dietitian_account_id");
CREATE INDEX "tasks_dietitian_account_id_status_idx" ON "tasks"("dietitian_account_id", "status");
CREATE INDEX "tasks_dietitian_account_id_assigned_user_id_idx" ON "tasks"("dietitian_account_id", "assigned_user_id");
CREATE INDEX "tasks_assigned_user_id_idx" ON "tasks"("assigned_user_id");

CREATE INDEX "ai_requests_dietitian_account_id_requested_at_idx" ON "ai_requests"("dietitian_account_id", "requested_at");
CREATE INDEX "ai_requests_dietitian_account_id_status_requested_at_idx" ON "ai_requests"("dietitian_account_id", "status", "requested_at");

CREATE INDEX "automation_rules_dietitian_account_id_idx" ON "automation_rules"("dietitian_account_id");
CREATE INDEX "automation_rules_dietitian_account_id_status_idx" ON "automation_rules"("dietitian_account_id", "status");
CREATE INDEX "automation_rules_dietitian_account_id_trigger_type_idx" ON "automation_rules"("dietitian_account_id", "trigger_type");
CREATE UNIQUE INDEX "automation_runs_dietitian_account_id_trigger_key_key" ON "automation_runs"("dietitian_account_id", "trigger_key");
CREATE INDEX "automation_runs_dietitian_account_id_idx" ON "automation_runs"("dietitian_account_id");
CREATE INDEX "automation_runs_dietitian_account_id_status_idx" ON "automation_runs"("dietitian_account_id", "status");
