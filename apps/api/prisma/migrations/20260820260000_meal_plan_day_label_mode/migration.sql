-- CreateEnum
CREATE TYPE "MealPlanDayLabelMode" AS ENUM ('NUMBERED', 'WEEKDAY');

-- AlterTable
ALTER TABLE "meal_plans" ADD COLUMN "day_label_mode" "MealPlanDayLabelMode" NOT NULL DEFAULT 'NUMBERED';
