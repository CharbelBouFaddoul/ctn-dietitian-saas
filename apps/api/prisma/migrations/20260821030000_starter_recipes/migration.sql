-- Platform Starter recipes: nullable ownership + import source keys

ALTER TABLE "recipes" ALTER COLUMN "dietitian_account_id" DROP NOT NULL;
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "source_key" TEXT;
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "source_recipe_id" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "recipes_source_key_source_recipe_id_key"
  ON "recipes"("source_key", "source_recipe_id");

CREATE INDEX IF NOT EXISTS "recipes_status_name_idx" ON "recipes"("status", "name");

ALTER TABLE "recipe_ingredients" ALTER COLUMN "dietitian_account_id" DROP NOT NULL;
