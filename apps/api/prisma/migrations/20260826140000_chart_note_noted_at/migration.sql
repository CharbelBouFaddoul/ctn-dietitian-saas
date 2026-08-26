-- Allow chart notes to record the observation date separately from insert time.
ALTER TABLE "client_chart_notes" ADD COLUMN "noted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "client_chart_notes" SET "noted_at" = "created_at";

CREATE INDEX "client_chart_notes_client_id_kind_noted_at_idx" ON "client_chart_notes"("client_id", "kind", "noted_at");
