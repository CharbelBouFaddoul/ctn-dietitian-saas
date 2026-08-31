import { Injectable } from "@nestjs/common";
import { localDateKey, parseLocalDate } from "@nutrition-saas/utilities";
import { roundNutrition, sumNutrition, type NutritionValues } from "@nutrition-saas/nutrition";
import type { Client, MealLogCategory } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { requireDietitianAccountId } from "../dietitian/tenant-scope";
import {
  foodLogDisplayName,
  parseFoodLogNutritionSnapshot,
} from "./food-log-nutrition.service";
import { TrackingTimezoneService } from "./food-log.service";

const MEAL_ORDER: Array<MealLogCategory | "UNCATEGORIZED"> = [
  "BREAKFAST",
  "LUNCH",
  "DINNER",
  "SNACK",
  "OTHER",
  "UNCATEGORIZED",
];

const WEEKDAY_KEYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

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

type SnapshotDay = {
  dayNumber: number;
  weekday: string | null;
  meals?: Array<{ id: string }>;
};

type PlanSnapshot = {
  dayLabelMode?: "NUMBERED" | "WEEKDAY";
  days?: SnapshotDay[];
};

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

    const [
      foodLogs,
      waterLogs,
      exerciseLogs,
      sleepLog,
      habitLogs,
      goals,
      weekSleep,
      assignments,
      publishedVersion,
    ] = await Promise.all([
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
      this.prisma.clientHabitAssignment.findMany({
        where: { dietitianAccountId, clientId: client.id, active: true },
        include: { habitDefinition: true },
        orderBy: [{ habitDefinition: { sortOrder: "asc" } }, { habitDefinition: { name: "asc" } }],
      }),
      this.prisma.mealPlanVersion.findFirst({
        where: {
          status: "PUBLISHED",
          dietitianAccountId,
          mealPlan: {
            clientId: client.id,
            status: { not: "ARCHIVED" },
            dietitianAccountId,
          },
        },
        orderBy: { publishedAt: "desc" },
        select: { snapshot: true },
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
        foodId: row.foodId,
        foodName: foodLogDisplayName(snapshot, row.displayName),
        displayName: row.displayName ?? foodLogDisplayName(snapshot),
        sourceType: row.sourceType,
        sourceMealId: row.sourceMealId,
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
        items: items.map(({ id, foodId, foodName, displayName, sourceType, sourceMealId, quantity, unit, presented }) => ({
          id,
          foodId,
          foodName,
          displayName,
          sourceType,
          sourceMealId,
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

    const activeAssignments = assignments.filter(
      (a) => a.habitDefinition.active && !a.habitDefinition.archivedAt,
    );
    const logByDef = new Map(
      habitLogs.filter((l) => l.habitDefinitionId).map((l) => [l.habitDefinitionId!, l]),
    );
    const logByKey = new Map(habitLogs.map((l) => [l.habitKey, l]));
    const habitItems = activeAssignments.map((assignment) => {
      const def = assignment.habitDefinition;
      const log = logByDef.get(def.id) ?? logByKey.get(def.id);
      return {
        id: log?.id ?? null,
        habitDefinitionId: def.id,
        habitKey: def.id,
        habitLabel: def.name,
        completed: log?.completed ?? false,
        value: log?.value === null || log?.value === undefined ? null : Number(log.value),
      };
    });
    const habitsCompleted = habitItems.filter((row) => row.completed).length;

    const plannedMealLogs = foodLogs.filter((row) => row.sourceType === "PLANNED_MEAL");
    const plannedMealsTotal = this.plannedMealTotalForDate(publishedVersion?.snapshot, dateKey);
    const loggedPlannedMealIds = [
      ...new Set(
        plannedMealLogs
          .map((row) => row.sourceMealId)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    ];

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
        total: habitItems.length,
        completed: habitsCompleted,
        items: habitItems,
      },
      plannedMeals: {
        logged: plannedMealLogs.length,
        total: plannedMealsTotal,
        loggedMealIds: loggedPlannedMealIds,
      },
      goals: mappedGoals,
    };
  }

  nutritionFromSnapshots(snapshots: NutritionValues[]): NutritionValues {
    return sumNutrition(snapshots);
  }

  private plannedMealTotalForDate(snapshotValue: unknown, dateKey: string): number {
    if (!snapshotValue || typeof snapshotValue !== "object") return 0;
    const snapshot = snapshotValue as PlanSnapshot;
    const days = snapshot.days ?? [];
    if (days.length === 0) return 0;

    if (snapshot.dayLabelMode === "WEEKDAY") {
      const weekday = WEEKDAY_KEYS[new Date(`${dateKey}T12:00:00.000Z`).getUTCDay()] ?? null;
      const match = days.find((day) => day.weekday === weekday);
      if (match) return match.meals?.length ?? 0;
    }

    const day1 = days.find((day) => day.dayNumber === 1) ?? days[0];
    return day1?.meals?.length ?? 0;
  }
}
