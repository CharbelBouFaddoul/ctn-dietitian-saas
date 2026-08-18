-- Phase 8: client tracking logs.

ALTER TYPE "TimelineEventType" ADD VALUE 'FOOD_LOGGED';
ALTER TYPE "TimelineEventType" ADD VALUE 'WATER_LOGGED';
ALTER TYPE "TimelineEventType" ADD VALUE 'EXERCISE_LOGGED';
ALTER TYPE "TimelineEventType" ADD VALUE 'SLEEP_LOGGED';
ALTER TYPE "TimelineEventType" ADD VALUE 'HABIT_COMPLETED';

CREATE TYPE "TrackingLogStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "MealLogCategory" AS ENUM ('BREAKFAST', 'LUNCH', 'DINNER', 'SNACK', 'OTHER');
CREATE TYPE "WaterLogUnit" AS ENUM ('ml', 'l');
CREATE TYPE "ExerciseIntensity" AS ENUM ('LOW', 'MODERATE', 'HIGH');

CREATE TABLE "food_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "food_id" UUID NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL,
    "unit" "QuantityUnit" NOT NULL,
    "consumed_at" TIMESTAMPTZ NOT NULL,
    "tracking_date" DATE NOT NULL,
    "meal_category" "MealLogCategory",
    "notes" TEXT,
    "nutrition_snapshot" JSONB NOT NULL,
    "status" "TrackingLogStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "archived_at" TIMESTAMPTZ,
    CONSTRAINT "food_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "food_logs_quantity_positive" CHECK ("quantity" > 0),
    CONSTRAINT "food_logs_unit_not_serving" CHECK ("unit" <> 'serving')
);

CREATE INDEX "food_logs_organization_id_client_id_tracking_date_idx" ON "food_logs"("organization_id", "client_id", "tracking_date");
CREATE INDEX "food_logs_organization_id_client_id_consumed_at_idx" ON "food_logs"("organization_id", "client_id", "consumed_at");

CREATE TABLE "water_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "amount_ml" DECIMAL(12,4) NOT NULL,
    "logged_at" TIMESTAMPTZ NOT NULL,
    "tracking_date" DATE NOT NULL,
    "notes" TEXT,
    "status" "TrackingLogStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "archived_at" TIMESTAMPTZ,
    CONSTRAINT "water_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "water_logs_amount_positive" CHECK ("amount_ml" > 0)
);

CREATE INDEX "water_logs_organization_id_client_id_tracking_date_idx" ON "water_logs"("organization_id", "client_id", "tracking_date");

CREATE TABLE "exercise_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "activity_type" TEXT NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "intensity" "ExerciseIntensity",
    "calories_burned" DECIMAL(12,4),
    "performed_at" TIMESTAMPTZ NOT NULL,
    "tracking_date" DATE NOT NULL,
    "notes" TEXT,
    "status" "TrackingLogStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "archived_at" TIMESTAMPTZ,
    CONSTRAINT "exercise_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "exercise_logs_duration_positive" CHECK ("duration_minutes" > 0)
);

CREATE INDEX "exercise_logs_organization_id_client_id_tracking_date_idx" ON "exercise_logs"("organization_id", "client_id", "tracking_date");

CREATE TABLE "sleep_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "bedtime" TIMESTAMPTZ,
    "wake_time" TIMESTAMPTZ,
    "duration_minutes" INTEGER,
    "quality" INTEGER,
    "notes" TEXT,
    "status" "TrackingLogStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "archived_at" TIMESTAMPTZ,
    CONSTRAINT "sleep_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sleep_logs_duration_positive" CHECK ("duration_minutes" IS NULL OR "duration_minutes" > 0),
    CONSTRAINT "sleep_logs_quality_range" CHECK ("quality" IS NULL OR ("quality" >= 1 AND "quality" <= 5))
);

CREATE UNIQUE INDEX "sleep_logs_organization_id_client_id_date_key" ON "sleep_logs"("organization_id", "client_id", "date");
CREATE INDEX "sleep_logs_organization_id_client_id_date_idx" ON "sleep_logs"("organization_id", "client_id", "date");

CREATE TABLE "habit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "habit_key" TEXT NOT NULL,
    "habit_label" TEXT NOT NULL,
    "log_date" DATE NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "value" DECIMAL(12,4),
    "notes" TEXT,
    "status" "TrackingLogStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "archived_at" TIMESTAMPTZ,
    CONSTRAINT "habit_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "habit_logs_organization_id_client_id_habit_key_log_date_key" ON "habit_logs"("organization_id", "client_id", "habit_key", "log_date");
CREATE INDEX "habit_logs_organization_id_client_id_log_date_idx" ON "habit_logs"("organization_id", "client_id", "log_date");

ALTER TABLE "food_logs" ADD CONSTRAINT "food_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "food_logs" ADD CONSTRAINT "food_logs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "food_logs" ADD CONSTRAINT "food_logs_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "foods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "water_logs" ADD CONSTRAINT "water_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "water_logs" ADD CONSTRAINT "water_logs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exercise_logs" ADD CONSTRAINT "exercise_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exercise_logs" ADD CONSTRAINT "exercise_logs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sleep_logs" ADD CONSTRAINT "sleep_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sleep_logs" ADD CONSTRAINT "sleep_logs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "habit_logs" ADD CONSTRAINT "habit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "habit_logs" ADD CONSTRAINT "habit_logs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
