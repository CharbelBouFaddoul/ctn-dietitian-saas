-- Phase 6: food sources, foods, organization overrides. Global foods are platform-managed.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE "FoodReferenceUnit" AS ENUM ('g', 'ml');
CREATE TYPE "FoodOverrideStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "food_sources" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "dataset_version" TEXT NOT NULL,
    "license" TEXT NOT NULL,
    "attribution" TEXT NOT NULL,
    "homepage" TEXT,
    "imported_at" TIMESTAMPTZ NOT NULL,
    "metadata" JSONB,
    "last_import_report" JSONB,
    "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "food_sources_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "food_sources_key_key" ON "food_sources"("key");
CREATE INDEX "food_sources_status_idx" ON "food_sources"("status");

CREATE TABLE "foods" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "food_source_id" UUID NOT NULL,
    "source_food_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_normalized" TEXT NOT NULL,
    "category" TEXT,
    "serving_description" TEXT,
    "reference_quantity" DECIMAL(12,4) NOT NULL,
    "reference_unit" "FoodReferenceUnit" NOT NULL,
    "energy_kcal" DECIMAL(12,4),
    "protein_g" DECIMAL(12,4),
    "carbohydrate_g" DECIMAL(12,4),
    "fat_g" DECIMAL(12,4),
    "fiber_g" DECIMAL(12,4),
    "sugar_g" DECIMAL(12,4),
    "sodium_mg" DECIMAL(12,4),
    "extra_nutrients" JSONB,
    "status" "CatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "imported_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "foods_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "foods_food_source_id_source_food_id_key" ON "foods"("food_source_id", "source_food_id");
CREATE INDEX "foods_status_name_normalized_idx" ON "foods"("status", "name_normalized");
CREATE INDEX "foods_category_idx" ON "foods"("category");
CREATE INDEX "foods_food_source_id_status_idx" ON "foods"("food_source_id", "status");
CREATE INDEX "foods_name_normalized_trgm_idx" ON "foods" USING gin ("name_normalized" gin_trgm_ops);

CREATE TABLE "food_overrides" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "food_id" UUID NOT NULL,
    "status" "FoodOverrideStatus" NOT NULL DEFAULT 'ACTIVE',
    "energy_kcal" DECIMAL(12,4),
    "protein_g" DECIMAL(12,4),
    "carbohydrate_g" DECIMAL(12,4),
    "fat_g" DECIMAL(12,4),
    "fiber_g" DECIMAL(12,4),
    "sugar_g" DECIMAL(12,4),
    "sodium_mg" DECIMAL(12,4),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deactivated_at" TIMESTAMPTZ,
    CONSTRAINT "food_overrides_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "food_overrides_organization_id_food_id_key" ON "food_overrides"("organization_id", "food_id");
CREATE INDEX "food_overrides_organization_id_status_idx" ON "food_overrides"("organization_id", "status");
CREATE INDEX "food_overrides_food_id_idx" ON "food_overrides"("food_id");

ALTER TABLE "foods" ADD CONSTRAINT "foods_food_source_id_fkey" FOREIGN KEY ("food_source_id") REFERENCES "food_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "food_overrides" ADD CONSTRAINT "food_overrides_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "food_overrides" ADD CONSTRAINT "food_overrides_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "foods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "food_overrides" ADD CONSTRAINT "food_overrides_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
