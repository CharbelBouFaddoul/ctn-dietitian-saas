-- Phase 6: appointment category, reschedule proposal fields, notification types.

CREATE TYPE "AppointmentCategory" AS ENUM (
  'CONSULTATION',
  'FOLLOW_UP',
  'ASSESSMENT',
  'MEAL_PLAN',
  'OTHER'
);

ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'RESCHEDULE_PENDING';

ALTER TABLE "appointments"
  ADD COLUMN IF NOT EXISTS "category" "AppointmentCategory" NOT NULL DEFAULT 'CONSULTATION',
  ADD COLUMN IF NOT EXISTS "proposed_start_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "proposed_end_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "proposed_by_user_id" UUID;

ALTER TABLE "appointments"
  DROP CONSTRAINT IF EXISTS "appointments_proposed_by_user_id_fkey";

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_proposed_by_user_id_fkey"
  FOREIGN KEY ("proposed_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'APPOINTMENT_RESCHEDULE_PROPOSED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'APPOINTMENT_RESCHEDULE_ACCEPTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'APPOINTMENT_RESCHEDULE_REJECTED';
