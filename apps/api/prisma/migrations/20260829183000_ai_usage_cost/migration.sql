-- Dual AI budgets: persist token totals and estimated cost on usage + each request.

ALTER TABLE "ai_usage" ADD COLUMN "token_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ai_usage" ADD COLUMN "cost_micros" BIGINT NOT NULL DEFAULT 0;

ALTER TABLE "ai_requests" ADD COLUMN "cost_micros" BIGINT;
