import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Client, ExerciseIntensity } from "@prisma/client";
import { requireDietitianAccountId } from "../dietitian/tenant-scope";
import { PrismaService } from "../prisma/prisma.service";
import { TimelineService } from "../timeline/timeline.service";
import { TrackingTimezoneService } from "./food-log.service";
function toMl(amount: number, unit: "ml" | "l"): number {
  return unit === "l" ? amount * 1000 : amount;
}

@Injectable()
export class WaterLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timezone: TrackingTimezoneService,
    private readonly timeline: TimelineService,
  ) {}

  async listForClient(client: Client, date: string) {
    const trackingDate = this.timezone.parseTrackingDate(date);
    const rows = await this.prisma.waterLog.findMany({
      where: { dietitianAccountId: requireDietitianAccountId(client), clientId: client.id, trackingDate, status: "ACTIVE" },
      orderBy: { loggedAt: "asc" },
    });
    return rows.map((row) => this.toResponse(row));
  }

  async createForClient(
    client: Client,
    actorUserId: string,
    input: { amount: number; unit: "ml" | "l"; loggedAt?: string; notes?: string },
  ) {
    if (!(input.amount > 0)) {
      throw new BadRequestException("Amount must be greater than zero");
    }
    const loggedAt = input.loggedAt ? new Date(input.loggedAt) : new Date();
    if (Number.isNaN(loggedAt.getTime())) {
      throw new BadRequestException("loggedAt must be a valid timestamp");
    }
    const timeZone = await this.timezone.timezoneForClient(client);
    const row = await this.prisma.waterLog.create({
      data: {
        dietitianAccountId: requireDietitianAccountId(client),
        clientId: client.id,
        amountMl: toMl(input.amount, input.unit),
        loggedAt,
        trackingDate: this.timezone.trackingDate(loggedAt, timeZone),
        notes: input.notes ?? null,
      },
    });
    await this.timeline.record({
      dietitianAccountId: requireDietitianAccountId(client),
      clientId: client.id,
      type: "WATER_LOGGED",
      actorUserId,
      targetType: "water_log",
      targetId: row.id,
    });
    return this.toResponse(row);
  }

  async updateForClient(
    client: Client,
    logId: string,
    input: { amount?: number; unit?: "ml" | "l"; loggedAt?: string; notes?: string | null },
  ) {
    const row = await this.requireActive(client, logId);
    const loggedAt = input.loggedAt ? new Date(input.loggedAt) : row.loggedAt;
    if (Number.isNaN(loggedAt.getTime())) {
      throw new BadRequestException("loggedAt must be a valid timestamp");
    }
    const timeZone = await this.timezone.timezoneForClient(client);
    const updated = await this.prisma.waterLog.update({
      where: { id: row.id },
      data: {
        ...(input.amount !== undefined ? { amountMl: toMl(input.amount, input.unit ?? "ml") } : {}),
        loggedAt,
        trackingDate: this.timezone.trackingDate(loggedAt, timeZone),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
    });
    return this.toResponse(updated);
  }

  async archiveForClient(client: Client, logId: string) {
    const row = await this.requireActive(client, logId);
    const updated = await this.prisma.waterLog.update({
      where: { id: row.id },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });
    return this.toResponse(updated);
  }

  private async requireActive(client: Client, logId: string) {
    const row = await this.prisma.waterLog.findFirst({
      where: { id: logId, dietitianAccountId: requireDietitianAccountId(client), clientId: client.id, status: "ACTIVE" },
    });
    if (!row) throw new NotFoundException("Water log not found");
    return row;
  }

  private toResponse(row: {
    id: string;
    amountMl: { toString(): string } | number;
    loggedAt: Date;
    trackingDate: Date;
    notes: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      amountMl: Number(row.amountMl),
      loggedAt: row.loggedAt.toISOString(),
      trackingDate: row.trackingDate.toISOString().slice(0, 10),
      notes: row.notes,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

@Injectable()
export class ExerciseLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timezone: TrackingTimezoneService,
    private readonly timeline: TimelineService,
  ) {}

  async listForClient(client: Client, date: string) {
    const trackingDate = this.timezone.parseTrackingDate(date);
    const rows = await this.prisma.exerciseLog.findMany({
      where: { dietitianAccountId: requireDietitianAccountId(client), clientId: client.id, trackingDate, status: "ACTIVE" },
      orderBy: { performedAt: "asc" },
    });
    return rows.map((row) => this.toResponse(row));
  }

  async createForClient(
    client: Client,
    actorUserId: string,
    input: {
      activityType: string;
      durationMinutes: number;
      intensity?: ExerciseIntensity;
      caloriesBurned?: number;
      performedAt?: string;
      notes?: string;
    },
  ) {
    if (!(input.durationMinutes > 0)) {
      throw new BadRequestException("Duration must be greater than zero");
    }
    const performedAt = input.performedAt ? new Date(input.performedAt) : new Date();
    if (Number.isNaN(performedAt.getTime())) {
      throw new BadRequestException("performedAt must be a valid timestamp");
    }
    const timeZone = await this.timezone.timezoneForClient(client);
    const row = await this.prisma.exerciseLog.create({
      data: {
        dietitianAccountId: requireDietitianAccountId(client),
        clientId: client.id,
        activityType: input.activityType.trim(),
        durationMinutes: input.durationMinutes,
        intensity: input.intensity ?? null,
        caloriesBurned: input.caloriesBurned ?? null,
        performedAt,
        trackingDate: this.timezone.trackingDate(performedAt, timeZone),
        notes: input.notes ?? null,
      },
    });
    await this.timeline.record({
      dietitianAccountId: requireDietitianAccountId(client),
      clientId: client.id,
      type: "EXERCISE_LOGGED",
      actorUserId,
      targetType: "exercise_log",
      targetId: row.id,
    });
    return this.toResponse(row);
  }

  async updateForClient(
    client: Client,
    logId: string,
    input: {
      activityType?: string;
      durationMinutes?: number;
      intensity?: ExerciseIntensity | null;
      caloriesBurned?: number | null;
      performedAt?: string;
      notes?: string | null;
    },
  ) {
    const row = await this.requireActive(client, logId);
    if (input.durationMinutes !== undefined && !(input.durationMinutes > 0)) {
      throw new BadRequestException("Duration must be greater than zero");
    }
    const performedAt = input.performedAt ? new Date(input.performedAt) : row.performedAt;
    if (Number.isNaN(performedAt.getTime())) {
      throw new BadRequestException("performedAt must be a valid timestamp");
    }
    const timeZone = await this.timezone.timezoneForClient(client);
    const updated = await this.prisma.exerciseLog.update({
      where: { id: row.id },
      data: {
        ...(input.activityType !== undefined ? { activityType: input.activityType.trim() } : {}),
        ...(input.durationMinutes !== undefined ? { durationMinutes: input.durationMinutes } : {}),
        ...(input.intensity !== undefined ? { intensity: input.intensity } : {}),
        ...(input.caloriesBurned !== undefined ? { caloriesBurned: input.caloriesBurned } : {}),
        performedAt,
        trackingDate: this.timezone.trackingDate(performedAt, timeZone),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
    });
    return this.toResponse(updated);
  }

  async archiveForClient(client: Client, logId: string) {
    const row = await this.requireActive(client, logId);
    const updated = await this.prisma.exerciseLog.update({
      where: { id: row.id },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });
    return this.toResponse(updated);
  }

  private async requireActive(client: Client, logId: string) {
    const row = await this.prisma.exerciseLog.findFirst({
      where: { id: logId, dietitianAccountId: requireDietitianAccountId(client), clientId: client.id, status: "ACTIVE" },
    });
    if (!row) throw new NotFoundException("Exercise log not found");
    return row;
  }

  private toResponse(row: {
    id: string;
    activityType: string;
    durationMinutes: number;
    intensity: ExerciseIntensity | null;
    caloriesBurned: { toString(): string } | number | null;
    performedAt: Date;
    trackingDate: Date;
    notes: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      activityType: row.activityType,
      durationMinutes: row.durationMinutes,
      intensity: row.intensity,
      caloriesBurned: row.caloriesBurned === null ? null : Number(row.caloriesBurned),
      performedAt: row.performedAt.toISOString(),
      trackingDate: row.trackingDate.toISOString().slice(0, 10),
      notes: row.notes,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export function computeSleepDurationMinutes(bedtime: Date, wakeTime: Date): number {
  const ms = wakeTime.getTime() - bedtime.getTime();
  if (ms <= 0) {
    throw new BadRequestException("Wake time must be after bedtime");
  }
  return Math.round(ms / 60000);
}

@Injectable()
export class SleepLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timezone: TrackingTimezoneService,
    private readonly timeline: TimelineService,
  ) {}

  async getForClient(client: Client, date: string) {
    const sleepDate = this.timezone.parseTrackingDate(date);
    const row = await this.prisma.sleepLog.findFirst({
      where: { dietitianAccountId: requireDietitianAccountId(client), clientId: client.id, date: sleepDate, status: "ACTIVE" },
    });
    return row ? this.toResponse(row) : null;
  }

  async upsertForClient(
    client: Client,
    actorUserId: string,
    input: {
      date: string;
      bedtime?: string;
      wakeTime?: string;
      durationMinutes?: number;
      quality?: number;
      notes?: string;
    },
  ) {
    const sleepDate = this.timezone.parseTrackingDate(input.date);
    const bedtime = input.bedtime ? new Date(input.bedtime) : null;
    const wakeTime = input.wakeTime ? new Date(input.wakeTime) : null;
    if (bedtime && Number.isNaN(bedtime.getTime())) {
      throw new BadRequestException("bedtime must be a valid timestamp");
    }
    if (wakeTime && Number.isNaN(wakeTime.getTime())) {
      throw new BadRequestException("wakeTime must be a valid timestamp");
    }
    let durationMinutes = input.durationMinutes ?? null;
    if (bedtime && wakeTime) {
      durationMinutes = computeSleepDurationMinutes(bedtime, wakeTime);
    }
    if (durationMinutes !== null && !(durationMinutes > 0)) {
      throw new BadRequestException("Sleep duration must be greater than zero");
    }
    if (input.quality !== undefined && (input.quality < 1 || input.quality > 5)) {
      throw new BadRequestException("Quality must be between 1 and 5");
    }

    const existing = await this.prisma.sleepLog.findFirst({
      where: { dietitianAccountId: requireDietitianAccountId(client), clientId: client.id, date: sleepDate },
    });
    const row = existing
      ? await this.prisma.sleepLog.update({
          where: { id: existing.id },
          data: {
            bedtime,
            wakeTime,
            durationMinutes,
            quality: input.quality ?? existing.quality,
            notes: input.notes ?? existing.notes,
            status: "ACTIVE",
            archivedAt: null,
          },
        })
      : await this.prisma.sleepLog.create({
          data: {
            dietitianAccountId: requireDietitianAccountId(client),
            clientId: client.id,
            date: sleepDate,
            bedtime,
            wakeTime,
            durationMinutes,
            quality: input.quality ?? null,
            notes: input.notes ?? null,
          },
        });

    if (!existing) {
      await this.timeline.record({
        dietitianAccountId: requireDietitianAccountId(client),
        clientId: client.id,
        type: "SLEEP_LOGGED",
        actorUserId,
        targetType: "sleep_log",
        targetId: row.id,
      });
    }
    return this.toResponse(row);
  }

  async archiveForClient(client: Client, logId: string) {
    const row = await this.prisma.sleepLog.findFirst({
      where: { id: logId, dietitianAccountId: requireDietitianAccountId(client), clientId: client.id, status: "ACTIVE" },
    });
    if (!row) throw new NotFoundException("Sleep log not found");
    const updated = await this.prisma.sleepLog.update({
      where: { id: row.id },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });
    return this.toResponse(updated);
  }

  private toResponse(row: {
    id: string;
    date: Date;
    bedtime: Date | null;
    wakeTime: Date | null;
    durationMinutes: number | null;
    quality: number | null;
    notes: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      date: row.date.toISOString().slice(0, 10),
      bedtime: row.bedtime?.toISOString() ?? null,
      wakeTime: row.wakeTime?.toISOString() ?? null,
      durationMinutes: row.durationMinutes,
      quality: row.quality,
      notes: row.notes,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

@Injectable()
export class HabitLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timezone: TrackingTimezoneService,
    private readonly timeline: TimelineService,
  ) {}

  async listForClient(client: Client, date: string) {
    const logDate = this.timezone.parseTrackingDate(date);
    const rows = await this.prisma.habitLog.findMany({
      where: { dietitianAccountId: requireDietitianAccountId(client), clientId: client.id, logDate, status: "ACTIVE" },
      orderBy: { habitLabel: "asc" },
    });
    return rows.map((row) => this.toResponse(row));
  }

  async upsertForClient(
    client: Client,
    actorUserId: string,
    input: { habitKey: string; habitLabel: string; date: string; completed: boolean; value?: number; notes?: string },
  ) {
    const logDate = this.timezone.parseTrackingDate(input.date);
    const habitKey = input.habitKey.trim().toLowerCase().replace(/\s+/g, "_");
    if (!habitKey) {
      throw new BadRequestException("habitKey is required");
    }
    const existing = await this.prisma.habitLog.findFirst({
      where: {
        dietitianAccountId: requireDietitianAccountId(client),
        clientId: client.id,
        habitKey,
        logDate,
      },
    });
    const row = existing
      ? await this.prisma.habitLog.update({
          where: { id: existing.id },
          data: {
            habitLabel: input.habitLabel.trim(),
            completed: input.completed,
            value: input.value ?? null,
            notes: input.notes ?? null,
            status: "ACTIVE",
            archivedAt: null,
          },
        })
      : await this.prisma.habitLog.create({
          data: {
            dietitianAccountId: requireDietitianAccountId(client),
            clientId: client.id,
            habitKey,
            habitLabel: input.habitLabel.trim(),
            logDate,
            completed: input.completed,
            value: input.value ?? null,
            notes: input.notes ?? null,
          },
        });

    if (input.completed && (!existing || !existing.completed)) {
      await this.timeline.record({
        dietitianAccountId: requireDietitianAccountId(client),
        clientId: client.id,
        type: "HABIT_COMPLETED",
        actorUserId,
        targetType: "habit_log",
        targetId: row.id,
      });
    }
    return this.toResponse(row);
  }

  private toResponse(row: {
    id: string;
    habitKey: string;
    habitLabel: string;
    logDate: Date;
    completed: boolean;
    value: { toString(): string } | number | null;
    notes: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      habitKey: row.habitKey,
      habitLabel: row.habitLabel,
      date: row.logDate.toISOString().slice(0, 10),
      completed: row.completed,
      value: row.value === null ? null : Number(row.value),
      notes: row.notes,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
