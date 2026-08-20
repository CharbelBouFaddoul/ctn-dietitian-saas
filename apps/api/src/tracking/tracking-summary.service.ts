import { Injectable } from "@nestjs/common";
import { localDateKey, parseLocalDate } from "@nutrition-saas/utilities";
import { roundNutrition, sumNutrition, type NutritionValues } from "@nutrition-saas/nutrition";
import type { Client, MealLogCategory } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { requireDietitianAccountId } from "../dietitian/tenant-scope";
import { parseFoodLogNutritionSnapshot } from "./food-log-nutrition.service";
import { TrackingTimezoneService } from "./food-log.service";

const MEAL_ORDER: Array<MealLogCategory | "UNCATEGORIZED"> = [
  "BREAKFAST",
  "LUNCH",
  "DINNER",
  "SNACK",
  "OTHER",
  "UNCATEGORIZED",
];

function resolveWaterTargetMl(
  goals: Array<{ title: string; targetValue: number | null; targetUnit: string | null }>,
): number | null {
  for (const goal of goals) {
    if (goal.targetValue == null || !(goal.targetValue > 0)) continue;
    const unit = (goal.targetUnit ?? "").toLowerCase().trim();
    const title = goal.title.toLowerCase();
    const isWaterUnit = unit === "ml" || unit === "l";
    const isWaterTitle = /water/.test(title);
    if (!isWaterUnit && !isWaterTitle) continue;
    if (unit === "l") return goal.targetValue * 1000;
    if (unit === "ml") return goal.targetValue;
    // Title match without clear unit: assume liters if value is small, else ml
    if (goal.targetValue <= 20) return goal.targetValue * 1000;
    return goal.targetValue;
  }
  return null;
}

function shiftDateKey(dateKey: string, days: number): string {
  const base = parseLocalDate(dateKey);
  const shifted = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

@Injectable()
export class TrackingSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timezone: TrackingTimezoneService,
  ) {}

  async dailySummary(client: Client, date?: string) {
    const timeZone = await this.timezone.timezoneForClient(client);
    const dateKey = date ?? localDateKey(new Date(), timeZone);
    const trackingDate = this.timezone.parseTrackingDate(dateKey);
    const dietitianAccountId = requireDietitianAccountId(client);
    const weekStartKey = shiftDateKey(dateKey, -6);
    const weekStart = this.timezone.parseTrackingDate(weekStartKey);

    const [foodLogs, waterLogs, exerciseLogs, sleepLog, habitLogs, goals, weekSleep] = await Promise.all([
      this.prisma.foodLog.findMany({
        where: { dietitianAccountId, clientId: client.id, trackingDate, status: "ACTIVE" },
        orderBy: { consumedAt: "asc" },
      }),
      this.prisma.waterLog.findMany({
        where: { dietitianAccountId, clientId: client.id, trackingDate, status: "ACTIVE" },
        orderBy: { loggedAt: "asc" },
      }),
      this.prisma.exerciseLog.findMany({
        where: { dietitianAccountId, clientId: client.id, trackingDate, status: "ACTIVE" },
        orderBy: { performedAt: "asc" },
      }),
      this.prisma.sleepLog.findFirst({
        where: { dietitianAccountId, clientId: client.id, date: trackingDate, status: "ACTIVE" },
      }),
      this.prisma.habitLog.findMany({
        where: { dietitianAccountId, clientId: client.id, logDate: trackingDate, status: "ACTIVE" },
      }),
      this.prisma.clientGoal.findMany({
        where: { dietitianAccountId, clientId: client.id, status: "ACTIVE" },
        select: { title: true, targetValue: true, targetUnit: true },
      }),
      this.prisma.sleepLog.findMany({
        where: {
          dietitianAccountId,
          clientId: client.id,
          status: "ACTIVE",
          date: { gte: weekStart, lte: trackingDate },
          durationMinutes: { not: null },
        },
        select: { durationMinutes: true },
      }),
    ]);

    const mappedGoals = goals.map((goal) => ({
      title: goal.title,
      targetValue: goal.targetValue === null ? null : Number(goal.targetValue),
      targetUnit: goal.targetUnit,
    }));

    const foodItems = foodLogs.map((row) => {
      const snapshot = parseFoodLogNutritionSnapshot(row.nutritionSnapshot);
      return {
        id: row.id,
        foodName: snapshot.foodName,
        quantity: Number(row.quantity),
        unit: row.unit,
        mealCategory: row.mealCategory,
        presented: snapshot.presented,
        nutrition: snapshot.nutrition,
      };
    });

    const byMealMap = new Map<MealLogCategory | "UNCATEGORIZED", typeof foodItems>();
    for (const item of foodItems) {
      const key = item.mealCategory ?? "UNCATEGORIZED";
      const list = byMealMap.get(key) ?? [];
      list.push(item);
      byMealMap.set(key, list);
    }
    const byMeal = MEAL_ORDER.filter((category) => byMealMap.has(category)).map((category) => {
      const items = byMealMap.get(category)!;
      const mealTotals = sumNutrition(items.map((row) => row.nutrition));
      return {
        category,
        items: items.map(({ id, foodName, quantity, unit, presented }) => ({
          id,
          foodName,
          quantity,
          unit,
          presented,
        })),
        presented: roundNutrition(mealTotals),
      };
    });

    const foodTotals = sumNutrition(foodItems.map((row) => row.nutrition));
    const waterTotalMl = waterLogs.reduce((sum, row) => sum + Number(row.amountMl), 0);
    const exerciseDurationMinutes = exerciseLogs.reduce((sum, row) => sum + row.durationMinutes, 0);
    const habitsCompleted = habitLogs.filter((row) => row.completed).length;

    const weekDurations = weekSleep
      .map((row) => row.durationMinutes)
      .filter((v): v is number => v != null && v > 0);
    const sleepWeek =
      weekDurations.length > 0
        ? {
            nightsLogged: weekDurations.length,
            averageDurationMinutes: Math.round(
              weekDurations.reduce((sum, v) => sum + v, 0) / weekDurations.length,
            ),
          }
        : { nightsLogged: 0, averageDurationMinutes: null as number | null };

    return {
      date: dateKey,
      timezone: timeZone,
      food: {
        logCount: foodLogs.length,
        totals: foodTotals,
        presented: roundNutrition(foodTotals),
        byMeal,
      },
      water: {
        logCount: waterLogs.length,
        totalMl: waterTotalMl,
        totalLiters: waterTotalMl / 1000,
        targetMl: resolveWaterTargetMl(mappedGoals),
        entries: waterLogs.map((row) => ({
          id: row.id,
          amountMl: Number(row.amountMl),
          loggedAt: row.loggedAt.toISOString(),
        })),
      },
      exercise: {
        logCount: exerciseLogs.length,
        totalDurationMinutes: exerciseDurationMinutes,
        reportedCaloriesBurned: exerciseLogs.reduce(
          (sum, row) => sum + (row.caloriesBurned === null ? 0 : Number(row.caloriesBurned)),
          0,
        ),
        entries: exerciseLogs.map((row) => ({
          id: row.id,
          activityType: row.activityType,
          durationMinutes: row.durationMinutes,
          intensity: row.intensity,
          performedAt: row.performedAt.toISOString(),
        })),
      },
      sleep: sleepLog
        ? {
            id: sleepLog.id,
            durationMinutes: sleepLog.durationMinutes,
            quality: sleepLog.quality,
            bedtime: sleepLog.bedtime?.toISOString() ?? null,
            wakeTime: sleepLog.wakeTime?.toISOString() ?? null,
          }
        : null,
      sleepWeek,
      habits: {
        total: habitLogs.length,
        completed: habitsCompleted,
        items: habitLogs.map((row) => ({
          id: row.id,
          habitKey: row.habitKey,
          habitLabel: row.habitLabel,
          completed: row.completed,
          value: row.value === null ? null : Number(row.value),
        })),
      },
      goals: mappedGoals,
    };
  }

  nutritionFromSnapshots(snapshots: NutritionValues[]): NutritionValues {
    return sumNutrition(snapshots);
  }
}
