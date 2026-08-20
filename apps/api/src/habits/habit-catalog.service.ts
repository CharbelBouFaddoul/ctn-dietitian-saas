import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { localDateKey } from "@nutrition-saas/utilities";
import type { Client, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
import { requireDietitianAccountId, tenantWhere } from "../dietitian/tenant-scope";
import { ClientAccessService } from "../clients/client-access.service";
import { TimelineService } from "../timeline/timeline.service";
import { TrackingTimezoneService } from "../tracking/food-log.service";

@Injectable()
export class HabitCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClientAccessService,
    private readonly timezone: TrackingTimezoneService,
    private readonly timeline: TimelineService,
  ) {}

  async listCatalog(tenant: DietitianTenantContext) {
    const rows = await this.prisma.habitDefinition.findMany({
      where: {
        active: true,
        archivedAt: null,
        OR: [{ dietitianAccountId: null }, { dietitianAccountId: tenant.dietitianAccountId }],
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return rows.map((row) => this.toDefinition(row));
  }

  async createPracticeHabit(
    tenant: DietitianTenantContext,
    input: {
      name: string;
      description?: string;
      category?: string;
      defaultTargetValue?: number;
      defaultTargetUnit?: string;
      sortOrder?: number;
    },
  ) {
    const name = input.name.trim();
    if (name.length < 2) {
      throw new BadRequestException("Name must be at least 2 characters");
    }
    const row = await this.prisma.habitDefinition.create({
      data: {
        dietitianAccountId: tenant.dietitianAccountId,
        name,
        description: input.description?.trim() || null,
        category: input.category?.trim() || null,
        defaultTargetValue: input.defaultTargetValue ?? null,
        defaultTargetUnit: input.defaultTargetUnit?.trim() || null,
        sortOrder: input.sortOrder ?? 100,
        frequency: "DAILY",
        active: true,
      },
    });
    return this.toDefinition(row);
  }

  async updatePracticeHabit(
    tenant: DietitianTenantContext,
    habitId: string,
    input: {
      name?: string;
      description?: string | null;
      category?: string | null;
      defaultTargetValue?: number | null;
      defaultTargetUnit?: string | null;
      sortOrder?: number;
      active?: boolean;
    },
  ) {
    const row = await this.requirePracticeHabit(tenant.dietitianAccountId, habitId);
    const updated = await this.prisma.habitDefinition.update({
      where: { id: row.id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
        ...(input.category !== undefined ? { category: input.category?.trim() || null } : {}),
        ...(input.defaultTargetValue !== undefined ? { defaultTargetValue: input.defaultTargetValue } : {}),
        ...(input.defaultTargetUnit !== undefined
          ? { defaultTargetUnit: input.defaultTargetUnit?.trim() || null }
          : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(input.active !== undefined
          ? { active: input.active, archivedAt: input.active ? null : new Date() }
          : {}),
      },
    });
    return this.toDefinition(updated);
  }

  async listClientAssignments(tenant: DietitianTenantContext, clientId: string) {
    await this.access.assertCanAccess(tenant, clientId, "read");
    return this.listAssignmentsForClient(tenant.dietitianAccountId, clientId);
  }

  async assignToClient(
    tenant: DietitianTenantContext,
    clientId: string,
    input: { habitDefinitionId: string; targetValue?: number; targetUnit?: string },
  ) {
    await this.access.assertCanAccess(tenant, clientId, "manageRecords");
    const definition = await this.requireAssignableHabit(tenant.dietitianAccountId, input.habitDefinitionId);
    const existing = await this.prisma.clientHabitAssignment.findUnique({
      where: {
        clientId_habitDefinitionId: {
          clientId,
          habitDefinitionId: definition.id,
        },
      },
    });
    const row = existing
      ? await this.prisma.clientHabitAssignment.update({
          where: { id: existing.id },
          data: {
            active: true,
            targetValue: input.targetValue ?? definition.defaultTargetValue,
            targetUnit: input.targetUnit ?? definition.defaultTargetUnit,
          },
          include: { habitDefinition: true },
        })
      : await this.prisma.clientHabitAssignment.create({
          data: {
            dietitianAccountId: tenant.dietitianAccountId,
            clientId,
            habitDefinitionId: definition.id,
            targetValue: input.targetValue ?? definition.defaultTargetValue,
            targetUnit: input.targetUnit ?? definition.defaultTargetUnit,
            active: true,
          },
          include: { habitDefinition: true },
        });
    return this.toAssignment(row);
  }

  async unassignFromClient(tenant: DietitianTenantContext, clientId: string, habitId: string) {
    await this.access.assertCanAccess(tenant, clientId, "manageRecords");
    const row = await this.prisma.clientHabitAssignment.findFirst({
      where: {
        ...tenantWhere(tenant.dietitianAccountId),
        clientId,
        habitDefinitionId: habitId,
        active: true,
      },
    });
    if (!row) {
      throw new NotFoundException("Habit assignment not found");
    }
    await this.prisma.clientHabitAssignment.update({
      where: { id: row.id },
      data: { active: false },
    });
    return { ok: true };
  }

  async portalList(client: Client, date?: string) {
    const dietitianAccountId = requireDietitianAccountId(client);
    const timeZone = await this.timezone.timezoneForClient(client);
    const dateKey = date ?? (await this.defaultDate(client));
    const logDate = this.timezone.parseTrackingDate(dateKey);
    const [assignments, logs] = await Promise.all([
      this.prisma.clientHabitAssignment.findMany({
        where: { dietitianAccountId, clientId: client.id, active: true },
        include: { habitDefinition: true },
        orderBy: [{ habitDefinition: { sortOrder: "asc" } }, { habitDefinition: { name: "asc" } }],
      }),
      this.prisma.habitLog.findMany({
        where: { dietitianAccountId, clientId: client.id, logDate, status: "ACTIVE" },
      }),
    ]);
    const logByKey = new Map(logs.map((log) => [log.habitKey, log]));
    const logByDef = new Map(
      logs.filter((log) => log.habitDefinitionId).map((log) => [log.habitDefinitionId!, log]),
    );

    return {
      date: dateKey,
      timezone: timeZone,
      habits: assignments
        .filter((a) => a.habitDefinition.active && !a.habitDefinition.archivedAt)
        .map((assignment) => {
          const def = assignment.habitDefinition;
          const key = def.id;
          const log = logByDef.get(def.id) ?? logByKey.get(key);
          return {
            habitDefinitionId: def.id,
            name: def.name,
            description: def.description,
            category: def.category,
            targetValue:
              assignment.targetValue !== null
                ? Number(assignment.targetValue)
                : def.defaultTargetValue !== null
                  ? Number(def.defaultTargetValue)
                  : null,
            targetUnit: assignment.targetUnit ?? def.defaultTargetUnit,
            frequency: def.frequency,
            completed: log?.completed ?? false,
            logId: log?.id ?? null,
            value: log?.value === null || log?.value === undefined ? null : Number(log.value),
          };
        }),
    };
  }

  async portalUpsertLog(
    client: Client,
    actorUserId: string,
    habitDefinitionId: string,
    input: { date?: string; completed: boolean; value?: number; notes?: string },
  ) {
    const dietitianAccountId = requireDietitianAccountId(client);
    const assignment = await this.prisma.clientHabitAssignment.findFirst({
      where: {
        dietitianAccountId,
        clientId: client.id,
        habitDefinitionId,
        active: true,
      },
      include: { habitDefinition: true },
    });
    if (!assignment || !assignment.habitDefinition.active) {
      throw new NotFoundException("Habit not assigned");
    }
    const def = assignment.habitDefinition;
    if (def.dietitianAccountId && def.dietitianAccountId !== dietitianAccountId) {
      throw new ForbiddenException("Habit not available");
    }

    const dateKey = input.date ?? (await this.defaultDate(client));
    const logDate = this.timezone.parseTrackingDate(dateKey);
    const habitKey = def.id;
    const existing = await this.prisma.habitLog.findFirst({
      where: { dietitianAccountId, clientId: client.id, habitKey, logDate },
    });

    const row = existing
      ? await this.prisma.habitLog.update({
          where: { id: existing.id },
          data: {
            habitDefinitionId: def.id,
            habitLabel: def.name,
            completed: input.completed,
            value: input.value ?? null,
            notes: input.notes ?? null,
            status: "ACTIVE",
            archivedAt: null,
          },
        })
      : await this.prisma.habitLog.create({
          data: {
            dietitianAccountId,
            clientId: client.id,
            habitDefinitionId: def.id,
            habitKey,
            habitLabel: def.name,
            logDate,
            completed: input.completed,
            value: input.value ?? null,
            notes: input.notes ?? null,
          },
        });

    if (input.completed && (!existing || !existing.completed)) {
      await this.timeline.record({
        dietitianAccountId,
        clientId: client.id,
        type: "HABIT_COMPLETED",
        actorUserId,
        targetType: "habit_log",
        targetId: row.id,
      });
    }

    return {
      id: row.id,
      habitDefinitionId: def.id,
      habitKey: row.habitKey,
      habitLabel: row.habitLabel,
      date: row.logDate.toISOString().slice(0, 10),
      completed: row.completed,
      value: row.value === null ? null : Number(row.value),
      notes: row.notes,
      status: row.status,
    };
  }

  async listAssignmentsForClient(dietitianAccountId: string, clientId: string) {
    const rows = await this.prisma.clientHabitAssignment.findMany({
      where: { dietitianAccountId, clientId, active: true },
      include: { habitDefinition: true },
      orderBy: [{ habitDefinition: { sortOrder: "asc" } }, { habitDefinition: { name: "asc" } }],
    });
    return rows
      .filter((row) => row.habitDefinition.active && !row.habitDefinition.archivedAt)
      .map((row) => this.toAssignment(row));
  }

  private async defaultDate(client: Client) {
    const timeZone = await this.timezone.timezoneForClient(client);
    return localDateKey(new Date(), timeZone);
  }

  private async requirePracticeHabit(dietitianAccountId: string, habitId: string) {
    const row = await this.prisma.habitDefinition.findFirst({
      where: { id: habitId, dietitianAccountId },
    });
    if (!row) {
      throw new NotFoundException("Habit not found");
    }
    return row;
  }

  private async requireAssignableHabit(dietitianAccountId: string, habitId: string) {
    const row = await this.prisma.habitDefinition.findFirst({
      where: {
        id: habitId,
        active: true,
        archivedAt: null,
        OR: [{ dietitianAccountId: null }, { dietitianAccountId }],
      },
    });
    if (!row) {
      throw new NotFoundException("Habit not found");
    }
    return row;
  }

  private toDefinition(row: {
    id: string;
    dietitianAccountId: string | null;
    name: string;
    description: string | null;
    category: string | null;
    defaultTargetValue: Prisma.Decimal | null;
    defaultTargetUnit: string | null;
    frequency: string;
    active: boolean;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      scope: row.dietitianAccountId ? "practice" : "global",
      dietitianAccountId: row.dietitianAccountId,
      name: row.name,
      description: row.description,
      category: row.category,
      defaultTargetValue: row.defaultTargetValue === null ? null : Number(row.defaultTargetValue),
      defaultTargetUnit: row.defaultTargetUnit,
      frequency: row.frequency,
      active: row.active,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toAssignment(row: {
    id: string;
    habitDefinitionId: string;
    targetValue: Prisma.Decimal | null;
    targetUnit: string | null;
    active: boolean;
    assignedAt: Date;
    habitDefinition: {
      id: string;
      name: string;
      description: string | null;
      category: string | null;
      defaultTargetValue: Prisma.Decimal | null;
      defaultTargetUnit: string | null;
      frequency: string;
      dietitianAccountId: string | null;
    };
  }) {
    return {
      id: row.id,
      habitDefinitionId: row.habitDefinitionId,
      name: row.habitDefinition.name,
      description: row.habitDefinition.description,
      category: row.habitDefinition.category,
      scope: row.habitDefinition.dietitianAccountId ? "practice" : "global",
      targetValue:
        row.targetValue !== null
          ? Number(row.targetValue)
          : row.habitDefinition.defaultTargetValue !== null
            ? Number(row.habitDefinition.defaultTargetValue)
            : null,
      targetUnit: row.targetUnit ?? row.habitDefinition.defaultTargetUnit,
      frequency: row.habitDefinition.frequency,
      active: row.active,
      assignedAt: row.assignedAt.toISOString(),
    };
  }
}
