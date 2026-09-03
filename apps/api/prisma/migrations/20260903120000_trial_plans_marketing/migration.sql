-- Trial signup, public plan listing, and sample-data flags
CREATE TYPE "TrialSeedStatus" AS ENUM ('NONE', 'PENDING', 'READY', 'FAILED', 'CLEARED');

ALTER TABLE "plans" ADD COLUMN "listed_publicly" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "platform_settings"
  ADD COLUMN "email_verification_required" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "online_checkout_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "trial_signup_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "trial_duration_days" INTEGER NOT NULL DEFAULT 14,
  ADD COLUMN "trial_plan_slug" TEXT NOT NULL DEFAULT 'trial';

ALTER TABLE "dietitian_accounts"
  ADD COLUMN "trial_seed_status" "TrialSeedStatus" NOT NULL DEFAULT 'NONE';

ALTER TABLE "clients" ADD COLUMN "is_trial_seed" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "clients_dietitian_account_id_is_trial_seed_idx"
  ON "clients"("dietitian_account_id", "is_trial_seed");
