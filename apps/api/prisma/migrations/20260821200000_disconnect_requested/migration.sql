-- Patient may request disconnect; dietitian still owns deactivate approval.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DISCONNECT_REQUESTED';

ALTER TABLE "client_accounts"
  ADD COLUMN IF NOT EXISTS "disconnect_requested_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "disconnect_request_note" VARCHAR(500);
