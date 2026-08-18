-- CreateEnum
CREATE TYPE "AutomationRuleStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AutomationTriggerType" AS ENUM ('APPOINTMENT_UPCOMING', 'APPOINTMENT_MISSED', 'CLIENT_INACTIVE', 'MEAL_PLAN_ENDING', 'INVOICE_OVERDUE', 'TASK_DUE', 'CLIENT_CHECKIN_DUE', 'SCHEDULED_DATE_TIME');

-- CreateEnum
CREATE TYPE "AutomationActionType" AS ENUM ('SEND_IN_APP_NOTIFICATION', 'SEND_EMAIL', 'CREATE_TASK', 'CREATE_CLIENT_NOTIFICATION');

-- CreateEnum
CREATE TYPE "AutomationRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'AUTOMATION';

-- CreateTable
CREATE TABLE "automation_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "AutomationRuleStatus" NOT NULL DEFAULT 'PAUSED',
    "trigger_type" "AutomationTriggerType" NOT NULL,
    "action_type" "AutomationActionType" NOT NULL,
    "configuration" JSONB NOT NULL,
    "conditions" JSONB,
    "created_by_id" UUID NOT NULL,
    "updated_by_id" UUID,
    "last_run_at" TIMESTAMPTZ,
    "archived_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "automation_rule_id" UUID NOT NULL,
    "status" "AutomationRunStatus" NOT NULL DEFAULT 'QUEUED',
    "trigger_key" TEXT NOT NULL,
    "scheduled_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "error_code" TEXT,
    "error_message" TEXT,
    "result_metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_usage" (
    "organization_id" UUID NOT NULL,
    "period_key" TEXT NOT NULL,
    "execution_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "automation_usage_pkey" PRIMARY KEY ("organization_id","period_key")
);

-- CreateIndex
CREATE INDEX "automation_rules_organization_id_idx" ON "automation_rules"("organization_id");

-- CreateIndex
CREATE INDEX "automation_rules_organization_id_status_idx" ON "automation_rules"("organization_id", "status");

-- CreateIndex
CREATE INDEX "automation_rules_organization_id_trigger_type_idx" ON "automation_rules"("organization_id", "trigger_type");

-- CreateIndex
CREATE UNIQUE INDEX "automation_runs_organization_id_trigger_key_key" ON "automation_runs"("organization_id", "trigger_key");

-- CreateIndex
CREATE INDEX "automation_runs_organization_id_idx" ON "automation_runs"("organization_id");

-- CreateIndex
CREATE INDEX "automation_runs_automation_rule_id_idx" ON "automation_runs"("automation_rule_id");

-- CreateIndex
CREATE INDEX "automation_runs_organization_id_status_idx" ON "automation_runs"("organization_id", "status");

-- CreateIndex
CREATE INDEX "automation_runs_scheduled_at_idx" ON "automation_runs"("scheduled_at");

-- CreateIndex
CREATE INDEX "automation_runs_created_at_idx" ON "automation_runs"("created_at");

-- CreateIndex
CREATE INDEX "automation_usage_organization_id_idx" ON "automation_usage"("organization_id");

-- AddForeignKey
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_automation_rule_id_fkey" FOREIGN KEY ("automation_rule_id") REFERENCES "automation_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_usage" ADD CONSTRAINT "automation_usage_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
