-- Split self-serve registration into dietitian vs patient toggles.
ALTER TABLE "platform_settings"
  ADD COLUMN "dietitian_registration_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "patient_registration_enabled" BOOLEAN NOT NULL DEFAULT false;

UPDATE "platform_settings"
SET
  "dietitian_registration_enabled" = "registration_enabled",
  "patient_registration_enabled" = "registration_enabled";

ALTER TABLE "platform_settings"
  DROP COLUMN "registration_enabled";
