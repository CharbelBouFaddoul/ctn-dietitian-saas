-- Clinical profile JSON + clinic chart notes (notes, meal notes, eating habits, pregnancy).
CREATE TYPE "ChartNoteKind" AS ENUM ('CLINICAL', 'MEAL', 'EATING_HABIT', 'PREGNANCY');

ALTER TABLE "client_profiles" ADD COLUMN "clinical_data" JSONB;

CREATE TABLE "client_chart_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dietitian_account_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "kind" "ChartNoteKind" NOT NULL,
    "body" TEXT NOT NULL,
    "meal_slot" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "client_chart_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "client_chart_notes_dietitian_account_id_client_id_kind_idx" ON "client_chart_notes"("dietitian_account_id", "client_id", "kind");
CREATE INDEX "client_chart_notes_client_id_kind_created_at_idx" ON "client_chart_notes"("client_id", "kind", "created_at");

ALTER TABLE "client_chart_notes" ADD CONSTRAINT "client_chart_notes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "client_chart_notes" ADD CONSTRAINT "client_chart_notes_dietitian_account_id_fkey" FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
