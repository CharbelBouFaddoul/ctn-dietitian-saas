-- Dietitian professional profile fields and clinic preference JSON.

ALTER TABLE "dietitian_accounts"
  ADD COLUMN IF NOT EXISTS "license_number" TEXT;

CREATE TYPE "EnergyUnit" AS ENUM ('kcal', 'kj');

ALTER TABLE "dietitian_settings"
  ADD COLUMN IF NOT EXISTS "energy_unit" "EnergyUnit" NOT NULL DEFAULT 'kcal',
  ADD COLUMN IF NOT EXISTS "default_appointment_status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
  ADD COLUMN IF NOT EXISTS "appointment_reminders" JSONB,
  ADD COLUMN IF NOT EXISTS "meal_plan_share" JSONB,
  ADD COLUMN IF NOT EXISTS "enabled_measurements" JSONB,
  ADD COLUMN IF NOT EXISTS "portal_presets" JSONB;
