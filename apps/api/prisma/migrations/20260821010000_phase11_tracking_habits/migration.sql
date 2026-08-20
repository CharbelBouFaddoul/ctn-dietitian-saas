-- Product Phase 11: planned-meal FoodLog metadata + habit catalog

-- Allow planned-meal logs to use QuantityUnit.serving
ALTER TABLE "food_logs" DROP CONSTRAINT IF EXISTS "food_logs_unit_not_serving";

CREATE TYPE "FoodLogSourceType" AS ENUM ('MANUAL', 'PLANNED_MEAL');
CREATE TYPE "HabitFrequency" AS ENUM ('DAILY');

ALTER TABLE "food_logs" ALTER COLUMN "food_id" DROP NOT NULL;

ALTER TABLE "food_logs"
  ADD COLUMN "display_name" TEXT,
  ADD COLUMN "source_type" "FoodLogSourceType" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "source_meal_id" UUID,
  ADD COLUMN "source_meal_plan_version_id" UUID,
  ADD COLUMN "servings_logged" DECIMAL(12,4),
  ADD COLUMN "serving_description" TEXT,
  ADD COLUMN "client_request_id" UUID;

CREATE UNIQUE INDEX "food_logs_dietitian_account_id_client_id_client_request_id_key"
  ON "food_logs"("dietitian_account_id", "client_id", "client_request_id");

CREATE INDEX "food_logs_dietitian_account_id_client_id_source_type_tracking_date_idx"
  ON "food_logs"("dietitian_account_id", "client_id", "source_type", "tracking_date");

CREATE TABLE "habit_definitions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "dietitian_account_id" UUID,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "category" TEXT,
  "default_target_value" DECIMAL(12,4),
  "default_target_unit" TEXT,
  "frequency" "HabitFrequency" NOT NULL DEFAULT 'DAILY',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  "archived_at" TIMESTAMPTZ,

  CONSTRAINT "habit_definitions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "habit_definitions_dietitian_account_id_active_sort_order_idx"
  ON "habit_definitions"("dietitian_account_id", "active", "sort_order");

CREATE INDEX "habit_definitions_active_sort_order_idx"
  ON "habit_definitions"("active", "sort_order");

ALTER TABLE "habit_definitions"
  ADD CONSTRAINT "habit_definitions_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "client_habit_assignments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "dietitian_account_id" UUID NOT NULL,
  "client_id" UUID NOT NULL,
  "habit_definition_id" UUID NOT NULL,
  "target_value" DECIMAL(12,4),
  "target_unit" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,

  CONSTRAINT "client_habit_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "client_habit_assignments_client_id_habit_definition_id_key"
  ON "client_habit_assignments"("client_id", "habit_definition_id");

CREATE INDEX "client_habit_assignments_dietitian_account_id_client_id_active_idx"
  ON "client_habit_assignments"("dietitian_account_id", "client_id", "active");

ALTER TABLE "client_habit_assignments"
  ADD CONSTRAINT "client_habit_assignments_dietitian_account_id_fkey"
  FOREIGN KEY ("dietitian_account_id") REFERENCES "dietitian_accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "client_habit_assignments"
  ADD CONSTRAINT "client_habit_assignments_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "clients"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "client_habit_assignments"
  ADD CONSTRAINT "client_habit_assignments_habit_definition_id_fkey"
  FOREIGN KEY ("habit_definition_id") REFERENCES "habit_definitions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "habit_logs"
  ADD COLUMN "habit_definition_id" UUID;

CREATE INDEX "habit_logs_habit_definition_id_idx" ON "habit_logs"("habit_definition_id");

ALTER TABLE "habit_logs"
  ADD CONSTRAINT "habit_logs_habit_definition_id_fkey"
  FOREIGN KEY ("habit_definition_id") REFERENCES "habit_definitions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Global default habits (dietitian_account_id NULL)
INSERT INTO "habit_definitions" (
  "id", "dietitian_account_id", "name", "description", "category",
  "default_target_value", "default_target_unit", "frequency", "active", "sort_order",
  "created_at", "updated_at"
) VALUES
  (gen_random_uuid(), NULL, 'Eat vegetables', 'Include vegetables with at least one meal', 'nutrition', NULL, NULL, 'DAILY', true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), NULL, 'Take a walk', 'Move for at least 10 minutes', 'activity', 10, 'min', 'DAILY', true, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), NULL, 'Eat breakfast', 'Start the day with a planned breakfast', 'nutrition', NULL, NULL, 'DAILY', true, 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), NULL, 'Drink water goal', 'Hit your daily water target', 'hydration', NULL, NULL, 'DAILY', true, 40, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), NULL, 'Sleep on schedule', 'Keep a consistent bedtime', 'sleep', NULL, NULL, 'DAILY', true, 50, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
