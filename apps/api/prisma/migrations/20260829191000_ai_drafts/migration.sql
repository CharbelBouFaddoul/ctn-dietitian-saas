-- Replayable AI drafts: validated output JSON only (no system/user prompt dump).

CREATE TABLE "ai_drafts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dietitian_account_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "action" "AiAction" NOT NULL,
    "user_input" VARCHAR(4000),
    "food_query" VARCHAR(200),
    "output" JSONB NOT NULL,
    "request_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ai_drafts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_drafts_dietitian_account_id_created_at_idx" ON "ai_drafts"("dietitian_account_id", "created_at");
CREATE INDEX "ai_drafts_dietitian_account_id_client_id_created_at_idx" ON "ai_drafts"("dietitian_account_id", "client_id", "created_at");

ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_dietitian_account_id_fkey" FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_drafts" ADD CONSTRAINT "ai_drafts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
