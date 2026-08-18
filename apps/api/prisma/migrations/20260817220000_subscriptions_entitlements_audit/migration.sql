-- Phase 4: plans, features, subscriptions, organization overrides, audit logs.
-- One subscription row per organization. No payment processor.

CREATE TYPE "CatalogStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
CREATE TYPE "FeatureValueType" AS ENUM ('BOOLEAN', 'LIMIT');
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'YEARLY');
CREATE TYPE "AuditResult" AS ENUM ('SUCCESS', 'FAILURE');

CREATE TABLE "plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plans_slug_key" ON "plans"("slug");

CREATE TABLE "features" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "value_type" "FeatureValueType" NOT NULL,
    "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "features_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "features_key_key" ON "features"("key");

CREATE TABLE "plan_features" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "plan_id" UUID NOT NULL,
    "feature_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "limit_value" INTEGER,
    "configuration" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "plan_features_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plan_features_plan_id_feature_id_key" ON "plan_features"("plan_id", "feature_id");
CREATE INDEX "plan_features_feature_id_idx" ON "plan_features"("feature_id");

CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "started_at" TIMESTAMPTZ(3),
    "current_period_start" TIMESTAMPTZ(3),
    "current_period_end" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "trial_starts_at" TIMESTAMPTZ(3),
    "trial_ends_at" TIMESTAMPTZ(3),
    "billing_cycle" "BillingCycle",
    "provider" TEXT,
    "external_id" TEXT,
    "payment_status" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscriptions_organization_id_key" ON "subscriptions"("organization_id");
CREATE INDEX "subscriptions_plan_id_idx" ON "subscriptions"("plan_id");
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

CREATE TABLE "feature_overrides" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "feature_id" UUID NOT NULL,
    "enabled" BOOLEAN,
    "limit_value" INTEGER,
    "configuration" JSONB,
    "reason" TEXT NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "feature_overrides_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "feature_overrides_organization_id_feature_id_key" ON "feature_overrides"("organization_id", "feature_id");
CREATE INDEX "feature_overrides_feature_id_idx" ON "feature_overrides"("feature_id");

CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_user_id" UUID,
    "organization_id" UUID,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "request_id" TEXT,
    "result" "AuditResult" NOT NULL,
    "metadata" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_actor_user_id_idx" ON "audit_logs"("actor_user_id");
CREATE INDEX "audit_logs_organization_id_idx" ON "audit_logs"("organization_id");
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_feature_id_fkey" FOREIGN KEY ("feature_id") REFERENCES "features"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "feature_overrides" ADD CONSTRAINT "feature_overrides_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "feature_overrides" ADD CONSTRAINT "feature_overrides_feature_id_fkey" FOREIGN KEY ("feature_id") REFERENCES "features"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "feature_overrides" ADD CONSTRAINT "feature_overrides_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed catalog: Standard / Pro / Premium with spec AI limits (not commercial invention).
-- Standard → AI disabled. Pro → 300 requests. Premium → 1000 requests.

INSERT INTO "plans" ("id", "name", "slug", "description", "status", "created_at", "updated_at") VALUES
    ('a1000000-0000-4000-8000-000000000001', 'Standard', 'standard', 'Standard practice plan. AI is disabled.', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('a1000000-0000-4000-8000-000000000002', 'Pro', 'pro', 'Pro practice plan. AI enabled with a monthly request quota.', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('a1000000-0000-4000-8000-000000000003', 'Premium', 'premium', 'Premium practice plan. AI enabled with a higher monthly request quota.', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "features" ("id", "key", "name", "description", "value_type", "status", "created_at", "updated_at") VALUES
    ('a2000000-0000-4000-8000-000000000001', 'AI', 'AI', 'Unified AI capability. Not a separate subscription.', 'BOOLEAN', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('a2000000-0000-4000-8000-000000000002', 'AI_REQUEST_LIMIT', 'AI request limit', 'Monthly AI request quota for the organization subscription.', 'LIMIT', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "plan_features" ("plan_id", "feature_id", "enabled", "limit_value", "created_at", "updated_at") VALUES
    ('a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', false, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002', false, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('a1000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000001', true, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('a1000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002', true, 300, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('a1000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000001', true, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('a1000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000002', true, 1000, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
