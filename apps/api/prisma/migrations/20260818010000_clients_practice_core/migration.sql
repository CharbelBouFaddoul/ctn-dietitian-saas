-- Phase 5: clients, accounts, assignments, practice records, settings expansion.
-- CLIENT is not an organization member.

ALTER TABLE "invitation_tokens" ADD COLUMN "client_id" UUID;
ALTER TABLE "invitation_tokens" ADD COLUMN "organization_id" UUID;
CREATE INDEX "invitation_tokens_client_id_idx" ON "invitation_tokens"("client_id");

ALTER TABLE "organization_settings" ADD COLUMN "practice_name" TEXT;
ALTER TABLE "organization_settings" ADD COLUMN "logo_storage_key" TEXT;
ALTER TABLE "organization_settings" ADD COLUMN "contact_email" TEXT;
ALTER TABLE "organization_settings" ADD COLUMN "contact_phone" TEXT;
ALTER TABLE "organization_settings" ADD COLUMN "address_line1" TEXT;
ALTER TABLE "organization_settings" ADD COLUMN "address_line2" TEXT;
ALTER TABLE "organization_settings" ADD COLUMN "city" TEXT;
ALTER TABLE "organization_settings" ADD COLUMN "region" TEXT;
ALTER TABLE "organization_settings" ADD COLUMN "postal_code" TEXT;
ALTER TABLE "organization_settings" ADD COLUMN "country" TEXT;
ALTER TABLE "organization_settings" ADD COLUMN "default_appointment_minutes" INTEGER NOT NULL DEFAULT 60;
ALTER TABLE "organization_settings" ADD COLUMN "reminder_email_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "organization_settings" ADD COLUMN "reminder_hours_before" INTEGER NOT NULL DEFAULT 24;
ALTER TABLE "organization_settings" ADD COLUMN "invoice_default_due_days" INTEGER NOT NULL DEFAULT 14;
ALTER TABLE "organization_settings" ADD COLUMN "invoice_footer" TEXT;
ALTER TABLE "organization_settings" ADD COLUMN "email_from_name" TEXT;
ALTER TABLE "organization_settings" ADD COLUMN "email_reply_to" TEXT;

CREATE TYPE "ClientStatus" AS ENUM ('PENDING', 'ACTIVE', 'INACTIVE', 'ARCHIVED');
CREATE TYPE "ClientSex" AS ENUM ('FEMALE', 'MALE', 'OTHER', 'UNSPECIFIED');
CREATE TYPE "ClientAccountStatus" AS ENUM ('PENDING', 'ACTIVE', 'DEACTIVATED');
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');
CREATE TYPE "MeasurementType" AS ENUM ('WEIGHT', 'HEIGHT', 'WAIST', 'HIPS', 'BODY_FAT', 'MUSCLE_MASS');
CREATE TYPE "AssessmentStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'COMPLETED', 'ARCHIVED');
CREATE TYPE "TemplateStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');
CREATE TYPE "TimelineEventType" AS ENUM (
  'CLIENT_CREATED', 'CLIENT_UPDATED', 'CLIENT_ASSIGNED', 'CLIENT_UNASSIGNED',
  'CLIENT_ARCHIVED', 'CLIENT_RESTORED', 'CLIENT_ACCOUNT_CREATED', 'CLIENT_ACCOUNT_ACTIVATED',
  'CLIENT_ACCOUNT_DEACTIVATED', 'GOAL_CREATED', 'GOAL_COMPLETED', 'GOAL_CANCELLED',
  'MEASUREMENT_ADDED', 'ASSESSMENT_STARTED', 'ASSESSMENT_COMPLETED',
  'APPOINTMENT_CREATED', 'APPOINTMENT_UPDATED', 'APPOINTMENT_COMPLETED', 'APPOINTMENT_CANCELLED',
  'NOTE'
);

CREATE TABLE "clients" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "code" TEXT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "display_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "date_of_birth" DATE,
    "sex" "ClientSex",
    "status" "ClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "clients_organization_id_status_idx" ON "clients"("organization_id", "status");
CREATE INDEX "clients_organization_id_last_name_idx" ON "clients"("organization_id", "last_name");
CREATE UNIQUE INDEX "clients_organization_id_code_key" ON "clients"("organization_id", "code");

CREATE TABLE "client_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "status" "ClientAccountStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activated_at" TIMESTAMPTZ(3),
    "deactivated_at" TIMESTAMPTZ(3),

    CONSTRAINT "client_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "client_accounts_user_id_key" ON "client_accounts"("user_id");
CREATE UNIQUE INDEX "client_accounts_client_id_key" ON "client_accounts"("client_id");
CREATE INDEX "client_accounts_organization_id_idx" ON "client_accounts"("organization_id");

CREATE TABLE "client_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "organization_member_id" UUID NOT NULL,
    "assigned_by_id" UUID,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassigned_at" TIMESTAMPTZ(3),

    CONSTRAINT "client_assignments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "client_assignments_organization_id_client_id_idx" ON "client_assignments"("organization_id", "client_id");
CREATE INDEX "client_assignments_organization_member_id_unassigned_at_idx" ON "client_assignments"("organization_member_id", "unassigned_at");
CREATE INDEX "client_assignments_client_id_unassigned_at_idx" ON "client_assignments"("client_id", "unassigned_at");
CREATE UNIQUE INDEX "client_assignments_one_active_per_client" ON "client_assignments"("client_id") WHERE "unassigned_at" IS NULL;

CREATE TABLE "client_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "nutrition_context" TEXT,
    "preferences" TEXT,
    "dietary_preferences" TEXT,
    "allergies" TEXT,
    "intolerances" TEXT,
    "lifestyle" TEXT,
    "notes" TEXT,
    "emergency_contact_name" TEXT,
    "emergency_contact_phone" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "client_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "client_profiles_client_id_key" ON "client_profiles"("client_id");
CREATE INDEX "client_profiles_organization_id_idx" ON "client_profiles"("organization_id");

CREATE TABLE "client_goals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "target_value" DECIMAL(12,3),
    "target_unit" TEXT,
    "start_date" DATE,
    "target_date" DATE,
    "completed_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "client_goals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "client_goals_organization_id_client_id_idx" ON "client_goals"("organization_id", "client_id");
CREATE INDEX "client_goals_client_id_status_idx" ON "client_goals"("client_id", "status");

CREATE TABLE "tags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tags_organization_id_name_key" ON "tags"("organization_id", "name");

CREATE TABLE "client_tags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_tags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "client_tags_client_id_tag_id_key" ON "client_tags"("client_id", "tag_id");
CREATE INDEX "client_tags_organization_id_tag_id_idx" ON "client_tags"("organization_id", "tag_id");

CREATE TABLE "timeline_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "type" "TimelineEventType" NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "actor_user_id" UUID,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timeline_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "timeline_events_organization_id_client_id_occurred_at_idx" ON "timeline_events"("organization_id", "client_id", "occurred_at");
CREATE INDEX "timeline_events_client_id_occurred_at_idx" ON "timeline_events"("client_id", "occurred_at");

CREATE TABLE "assessment_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "TemplateStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "schema" JSONB NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "assessment_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "assessment_templates_organization_id_status_idx" ON "assessment_templates"("organization_id", "status");

CREATE TABLE "assessments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "template_version" INTEGER NOT NULL,
    "status" "AssessmentStatus" NOT NULL DEFAULT 'DRAFT',
    "responses" JSONB,
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "assessments_organization_id_client_id_idx" ON "assessments"("organization_id", "client_id");
CREATE INDEX "assessments_client_id_status_idx" ON "assessments"("client_id", "status");

CREATE TABLE "client_measurements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "type" "MeasurementType" NOT NULL,
    "value" DECIMAL(12,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "measured_at" TIMESTAMPTZ(3) NOT NULL,
    "recorded_by_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_measurements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "client_measurements_organization_id_client_id_idx" ON "client_measurements"("organization_id", "client_id");
CREATE INDEX "client_measurements_client_id_measured_at_idx" ON "client_measurements"("client_id", "measured_at");

CREATE TABLE "appointments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "assigned_member_id" UUID,
    "title" TEXT NOT NULL,
    "start_at" TIMESTAMPTZ(3) NOT NULL,
    "end_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "appointments_organization_id_start_at_idx" ON "appointments"("organization_id", "start_at");
CREATE INDEX "appointments_organization_id_client_id_idx" ON "appointments"("organization_id", "client_id");
CREATE INDEX "appointments_client_id_start_at_idx" ON "appointments"("client_id", "start_at");

ALTER TABLE "invitation_tokens" ADD CONSTRAINT "invitation_tokens_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invitation_tokens" ADD CONSTRAINT "invitation_tokens_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "clients" ADD CONSTRAINT "clients_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clients" ADD CONSTRAINT "clients_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "client_accounts" ADD CONSTRAINT "client_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_accounts" ADD CONSTRAINT "client_accounts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_assignments" ADD CONSTRAINT "client_assignments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_assignments" ADD CONSTRAINT "client_assignments_organization_member_id_fkey" FOREIGN KEY ("organization_member_id") REFERENCES "organization_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_assignments" ADD CONSTRAINT "client_assignments_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "client_profiles" ADD CONSTRAINT "client_profiles_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "client_goals" ADD CONSTRAINT "client_goals_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_goals" ADD CONSTRAINT "client_goals_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tags" ADD CONSTRAINT "tags_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "client_tags" ADD CONSTRAINT "client_tags_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "client_tags" ADD CONSTRAINT "client_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "assessment_templates" ADD CONSTRAINT "assessment_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "assessment_templates" ADD CONSTRAINT "assessment_templates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "assessment_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "client_measurements" ADD CONSTRAINT "client_measurements_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_measurements" ADD CONSTRAINT "client_measurements_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_assigned_member_id_fkey" FOREIGN KEY ("assigned_member_id") REFERENCES "organization_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "features" ("id", "key", "name", "description", "value_type", "status", "created_at", "updated_at")
SELECT
  'a2000000-0000-4000-8000-000000000003',
  'CLIENT_LIMIT',
  'Client limit',
  'Maximum active/pending clients for the organization. Null plan limit means unlimited.',
  'LIMIT',
  'ACTIVE',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "features" WHERE "key" = 'CLIENT_LIMIT');

INSERT INTO "plan_features" ("plan_id", "feature_id", "enabled", "limit_value", "created_at", "updated_at")
SELECT p."id", f."id", true, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "plans" p
JOIN "features" f ON f."key" = 'CLIENT_LIMIT'
WHERE p."slug" IN ('standard', 'pro', 'premium')
  AND NOT EXISTS (
    SELECT 1 FROM "plan_features" pf
    WHERE pf."plan_id" = p."id" AND pf."feature_id" = f."id"
  );

INSERT INTO "assessment_templates" ("id", "organization_id", "name", "description", "status", "version", "schema", "created_at", "updated_at")
SELECT
  'a3000000-0000-4000-8000-000000000001',
  NULL,
  'Initial nutrition assessment',
  'Platform template. Completing an assessment stores this version so later template edits do not rewrite history.',
  'ACTIVE',
  1,
  '{"sections":[{"id":"context","title":"Nutrition context","fields":[{"id":"reason","label":"Reason for visit","type":"text"},{"id":"allergies","label":"Allergies","type":"text"},{"id":"preferences","label":"Dietary preferences","type":"text"},{"id":"goals","label":"Goals","type":"text"}]}]}'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "assessment_templates" WHERE "id" = 'a3000000-0000-4000-8000-000000000001');
