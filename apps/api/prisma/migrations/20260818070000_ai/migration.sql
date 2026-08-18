-- Phase 11: AI requests and usage tracking.

CREATE TYPE "AiRequestStatus" AS ENUM ('REJECTED', 'PENDING', 'COMPLETED', 'FAILED');
CREATE TYPE "AiAction" AS ENUM (
  'CLIENT_SUMMARY',
  'MEAL_PLAN_ASSISTANCE',
  'NUTRITION_ASSISTANCE',
  'CONSULTATION_SUMMARY',
  'MESSAGE_DRAFT'
);

CREATE TABLE "ai_usage" (
    "organization_id" UUID NOT NULL,
    "period_key" TEXT NOT NULL,
    "request_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("organization_id", "period_key")
);

CREATE INDEX "ai_usage_organization_id_idx" ON "ai_usage"("organization_id");

CREATE TABLE "ai_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "client_id" UUID,
    "action" "AiAction" NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "status" "AiRequestStatus" NOT NULL DEFAULT 'PENDING',
    "correlation_id" TEXT,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "latency_ms" INTEGER,
    "error_category" TEXT,
    "requested_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,
    CONSTRAINT "ai_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_requests_organization_id_requested_at_idx" ON "ai_requests"("organization_id", "requested_at");
CREATE INDEX "ai_requests_organization_id_status_requested_at_idx" ON "ai_requests"("organization_id", "status", "requested_at");
CREATE INDEX "ai_requests_user_id_requested_at_idx" ON "ai_requests"("user_id", "requested_at");
CREATE INDEX "ai_requests_client_id_idx" ON "ai_requests"("client_id");

ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_requests" ADD CONSTRAINT "ai_requests_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
