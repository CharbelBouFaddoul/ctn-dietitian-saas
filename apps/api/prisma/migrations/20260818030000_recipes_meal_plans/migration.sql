-- Phase 7: recipes, meal plans, versioned immutable published snapshots.

ALTER TYPE "TimelineEventType" ADD VALUE 'MEAL_PLAN_CREATED';
ALTER TYPE "TimelineEventType" ADD VALUE 'MEAL_PLAN_PUBLISHED';

CREATE TYPE "RecipeStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "MealPlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
CREATE TYPE "MealPlanVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED');
CREATE TYPE "MealItemType" AS ENUM ('FOOD', 'RECIPE');
CREATE TYPE "QuantityUnit" AS ENUM ('g', 'kg', 'oz', 'lb', 'ml', 'l', 'fl_oz', 'serving');

CREATE TABLE "recipes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT,
    "servings" DECIMAL(12,4) NOT NULL,
    "status" "RecipeStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "archived_at" TIMESTAMPTZ,
    CONSTRAINT "recipes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "recipes_servings_positive" CHECK ("servings" > 0)
);

CREATE INDEX "recipes_organization_id_status_name_idx" ON "recipes"("organization_id", "status", "name");

CREATE TABLE "recipe_ingredients" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "recipe_id" UUID NOT NULL,
    "food_id" UUID NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL,
    "unit" "QuantityUnit" NOT NULL,
    "display_note" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "recipe_ingredients_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "recipe_ingredients_quantity_positive" CHECK ("quantity" > 0),
    CONSTRAINT "recipe_ingredients_unit_not_serving" CHECK ("unit" <> 'serving')
);

CREATE INDEX "recipe_ingredients_organization_id_recipe_id_idx" ON "recipe_ingredients"("organization_id", "recipe_id");
CREATE INDEX "recipe_ingredients_recipe_id_sort_order_idx" ON "recipe_ingredients"("recipe_id", "sort_order");

CREATE TABLE "meal_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "MealPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "archived_at" TIMESTAMPTZ,
    CONSTRAINT "meal_plans_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "meal_plans_organization_id_client_id_status_idx" ON "meal_plans"("organization_id", "client_id", "status");
CREATE INDEX "meal_plans_organization_id_status_idx" ON "meal_plans"("organization_id", "status");

CREATE TABLE "meal_plan_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "meal_plan_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" "MealPlanVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "snapshot" JSONB,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ,
    "archived_at" TIMESTAMPTZ,
    CONSTRAINT "meal_plan_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "meal_plan_versions_meal_plan_id_version_number_key" ON "meal_plan_versions"("meal_plan_id", "version_number");
CREATE INDEX "meal_plan_versions_organization_id_meal_plan_id_status_idx" ON "meal_plan_versions"("organization_id", "meal_plan_id", "status");
CREATE UNIQUE INDEX "meal_plan_versions_one_published" ON "meal_plan_versions"("meal_plan_id") WHERE "status" = 'PUBLISHED';
CREATE UNIQUE INDEX "meal_plan_versions_one_draft" ON "meal_plan_versions"("meal_plan_id") WHERE "status" = 'DRAFT';

CREATE TABLE "meal_plan_days" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "meal_plan_version_id" UUID NOT NULL,
    "day_number" INTEGER NOT NULL,
    "weekday" TEXT,
    "title" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "meal_plan_days_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "meal_plan_days_day_number_positive" CHECK ("day_number" > 0)
);

CREATE UNIQUE INDEX "meal_plan_days_meal_plan_version_id_day_number_key" ON "meal_plan_days"("meal_plan_version_id", "day_number");
CREATE INDEX "meal_plan_days_organization_id_meal_plan_version_id_idx" ON "meal_plan_days"("organization_id", "meal_plan_version_id");

CREATE TABLE "meals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "meal_plan_day_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "meals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "meals_organization_id_meal_plan_day_id_sort_order_idx" ON "meals"("organization_id", "meal_plan_day_id", "sort_order");

CREATE TABLE "meal_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "meal_id" UUID NOT NULL,
    "item_type" "MealItemType" NOT NULL,
    "food_id" UUID,
    "recipe_id" UUID,
    "quantity" DECIMAL(12,4) NOT NULL,
    "unit" "QuantityUnit" NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "meal_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "meal_items_quantity_positive" CHECK ("quantity" > 0),
    CONSTRAINT "meal_items_source_check" CHECK (
        ("item_type" = 'FOOD' AND "food_id" IS NOT NULL AND "recipe_id" IS NULL AND "unit" <> 'serving')
        OR
        ("item_type" = 'RECIPE' AND "recipe_id" IS NOT NULL AND "food_id" IS NULL AND "unit" = 'serving')
    )
);

CREATE INDEX "meal_items_organization_id_meal_id_sort_order_idx" ON "meal_items"("organization_id", "meal_id", "sort_order");
CREATE INDEX "meal_items_food_id_idx" ON "meal_items"("food_id");
CREATE INDEX "meal_items_recipe_id_idx" ON "meal_items"("recipe_id");

ALTER TABLE "recipes" ADD CONSTRAINT "recipes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "foods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "meal_plans" ADD CONSTRAINT "meal_plans_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "meal_plans" ADD CONSTRAINT "meal_plans_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "meal_plans" ADD CONSTRAINT "meal_plans_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "meal_plan_versions" ADD CONSTRAINT "meal_plan_versions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "meal_plan_versions" ADD CONSTRAINT "meal_plan_versions_meal_plan_id_fkey" FOREIGN KEY ("meal_plan_id") REFERENCES "meal_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "meal_plan_versions" ADD CONSTRAINT "meal_plan_versions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "meal_plan_days" ADD CONSTRAINT "meal_plan_days_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "meal_plan_days" ADD CONSTRAINT "meal_plan_days_meal_plan_version_id_fkey" FOREIGN KEY ("meal_plan_version_id") REFERENCES "meal_plan_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "meals" ADD CONSTRAINT "meals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "meals" ADD CONSTRAINT "meals_meal_plan_day_id_fkey" FOREIGN KEY ("meal_plan_day_id") REFERENCES "meal_plan_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "meal_items" ADD CONSTRAINT "meal_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "meal_items" ADD CONSTRAINT "meal_items_meal_id_fkey" FOREIGN KEY ("meal_id") REFERENCES "meals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "meal_items" ADD CONSTRAINT "meal_items_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "foods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "meal_items" ADD CONSTRAINT "meal_items_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
