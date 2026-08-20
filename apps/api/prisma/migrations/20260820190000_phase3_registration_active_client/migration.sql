-- Phase 3 product cutover: registration gate + portal active client on session
ALTER TABLE "platform_settings"
  ADD COLUMN IF NOT EXISTS "registration_enabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "sessions"
  ADD COLUMN IF NOT EXISTS "active_client_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sessions_active_client_id_fkey'
  ) THEN
    ALTER TABLE "sessions"
      ADD CONSTRAINT "sessions_active_client_id_fkey"
      FOREIGN KEY ("active_client_id") REFERENCES "clients"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "sessions_active_client_id_idx" ON "sessions"("active_client_id");
