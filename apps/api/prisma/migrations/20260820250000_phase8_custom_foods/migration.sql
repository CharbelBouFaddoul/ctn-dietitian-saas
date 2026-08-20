-- Phase 8 (product): practice-owned custom foods on global Food table.
ALTER TABLE "foods" ADD COLUMN "dietitian_account_id" UUID;

ALTER TABLE "foods"
  ADD CONSTRAINT "foods_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "foods_dietitian_account_id_status_name_normalized_idx"
  ON "foods"("dietitian_account_id", "status", "name_normalized");

-- Dedicated source for practice-private custom foods (not USDA import).
INSERT INTO "food_sources" (
  "id",
  "key",
  "name",
  "provider",
  "dataset_version",
  "license",
  "attribution",
  "homepage",
  "imported_at",
  "status",
  "created_at",
  "updated_at"
)
VALUES (
  gen_random_uuid(),
  'practice-custom',
  'Practice custom foods',
  'Dietitian practice',
  '1',
  'Practice-owned. Not a USDA dataset.',
  'Custom foods created by dietitians for their own practice. Not shared globally.',
  NULL,
  NOW(),
  'ACTIVE',
  NOW(),
  NOW()
)
ON CONFLICT ("key") DO NOTHING;
