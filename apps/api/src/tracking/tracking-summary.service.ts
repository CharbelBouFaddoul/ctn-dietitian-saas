import { Injectable } from "@nestjs/common";
import { localDateKey } from "@nutrition-saas/utilities";
import { roundNutrition, sumNutrition, type NutritionValues } from "@nutrition-saas/nutrition";
import type { Client } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { requireDietitianAccountId } from "../dietitian/tenant-scope";
import { parseFoodLogNutritionSnapshot } from "./food-log-nutrition.service";
import { TrackingTimezoneService } from "./food-log.service";
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

    const [foodLogs, waterLogs, exerciseLogs, sleepLog, habitLogs, goals] = await Promise.all([
      this.prisma.foodLog.findMany({
        where: { dietitianAccountId: requireDietitianAccountId(client), clientId: client.id, trackingDate, status: "ACTIVE" },
        orderBy: { consumedAt: "asc" },
      }),
      this.prisma.waterLog.findMany({
        where: { dietitianAccountId: requireDietitianAccountId(client), clientId: client.id, trackingDate, status: "ACTIVE" },
      }),
      this.prisma.exerciseLog.findMany({
        where: { dietitianAccountId: requireDietitianAccountId(client), clientId: client.id, trackingDate, status: "ACTIVE" },
      }),
      this.prisma.sleepLog.findFirst({
        where: { dietitianAccountId: requireDietitianAccountId(client), clientId: client.id, date: trackingDate, status: "ACTIVE" },
      }),
      this.prisma.habitLog.findMany({
        where: { dietitianAccountId: requireDietitianAccountId(client), clientId: client.id, logDate: trackingDate, status: "ACTIVE" },
      }),
      this.prisma.clientGoal.findMany({
        where: { dietitianAccountId: requireDietitianAccountId(client), clientId: client.id, status: "ACTIVE" },
        select: { title: true, targetValue: true, targetUnit: true },
      }),
    ]);

    const nutritionParts = foodLogs.map((row) => parseFoodLogNutritionSnapshot(row.nutritionSnapshot).nutrition);
    const foodTotals = sumNutrition(nutritionParts);
    const waterTotalMl = waterLogs.reduce((sum, row) => sum + Number(row.amountMl), 0);
    const exerciseDurationMinutes = exerciseLogs.reduce((sum, row) => sum + row.durationMinutes, 0);
    const habitsCompleted = habitLogs.filter((row) => row.completed).length;

    return {
      date: dateKey,
      timezone: timeZone,
      food: {
        logCount: foodLogs.length,
        totals: foodTotals,
        presented: roundNutrition(foodTotals),
      },
      water: {
        logCount: waterLogs.length,
        totalMl: waterTotalMl,
        totalLiters: waterTotalMl / 1000,
      },
      exercise: {
        logCount: exerciseLogs.length,
        totalDurationMinutes: exerciseDurationMinutes,
        reportedCaloriesBurned: exerciseLogs.reduce(
          (sum, row) => sum + (row.caloriesBurned === null ? 0 : Number(row.caloriesBurned)),
          0,
        ),
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
      goals: goals.map((goal) => ({
        title: goal.title,
        targetValue: goal.targetValue === null ? null : Number(goal.targetValue),
        targetUnit: goal.targetUnit,
      })),
    };
  }

  nutritionFromSnapshots(snapshots: NutritionValues[]): NutritionValues {
    return sumNutrition(snapshots);
  }
}
