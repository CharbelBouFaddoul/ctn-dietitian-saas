import { Injectable } from "@nestjs/common";
import type { AutomationRule } from "@prisma/client";
import { dayBoundsUtc, localDateKey, parseLocalDate } from "@nutrition-saas/utilities";
import { PrismaService } from "../prisma/prisma.service";
import type { AutomationConfiguration, AutomationConditions } from "./automation.schemas";
export interface AutomationCandidate {
  triggerKey: string;
  clientId?: string;
  appointmentId?: string;
  invoiceId?: string;
  taskId?: string;
  mealPlanId?: string;
  metadata?: Record<string, string>;
}

@Injectable()
export class AutomationEvaluatorService {
  constructor(private readonly prisma: PrismaService) {}

  private accountId(rule: AutomationRule): string {
    if (!rule.dietitianAccountId) {
      throw new Error(`Automation rule ${rule.id} missing dietitianAccountId`);
    }
    return rule.dietitianAccountId;
  }

  async findCandidates(
    rule: AutomationRule,
    timezone: string,
    localDate: string,
  ): Promise<AutomationCandidate[]> {
    const configuration = rule.configuration as AutomationConfiguration;
    const conditions = (rule.conditions ?? {}) as AutomationConditions;

    let candidates: AutomationCandidate[];
    switch (rule.triggerType) {
      case "APPOINTMENT_UPCOMING":
        candidates = await this.appointmentUpcoming(
          this.accountId(rule),
          configuration,
          conditions,
          timezone,
          localDate,
        );
        break;
      case "APPOINTMENT_MISSED":
        candidates = await this.appointmentMissed(this.accountId(rule), configuration, timezone, localDate);
        break;
      case "CLIENT_INACTIVE":
        candidates = await this.clientInactive(this.accountId(rule), configuration, timezone, localDate);
        break;
      case "MEAL_PLAN_ENDING":
        candidates = await this.mealPlanEnding(this.accountId(rule), configuration, timezone, localDate);
        break;
      case "INVOICE_OVERDUE":
        candidates = await this.invoiceOverdue(this.accountId(rule), conditions, localDate);
        break;
      case "TASK_DUE":
        candidates = await this.taskDue(this.accountId(rule), conditions, timezone, localDate);
        break;
      case "CLIENT_CHECKIN_DUE":
        candidates = await this.clientCheckinDue(rule, configuration, timezone, localDate);
        break;
      case "SCHEDULED_DATE_TIME":
        candidates = await this.scheduledDateTime(rule, configuration, timezone, localDate);
        break;
      default:
        candidates = [];
    }

    return this.applyClientScope(candidates, configuration);
  }

  /** Narrow candidates to selected clients, or expand org-wide triggers per selected client. */
  private applyClientScope(
    candidates: AutomationCandidate[],
    configuration: AutomationConfiguration,
  ): AutomationCandidate[] {
    if (configuration.clientScope !== "SELECTED" || !configuration.clientIds?.length) {
      return candidates;
    }
    const allowed = new Set(configuration.clientIds);
    const scoped: AutomationCandidate[] = [];
    for (const candidate of candidates) {
      if (candidate.clientId) {
        if (allowed.has(candidate.clientId)) scoped.push(candidate);
        continue;
      }
      for (const clientId of configuration.clientIds) {
        scoped.push({
          ...candidate,
          clientId,
          triggerKey: `${candidate.triggerKey}:client:${clientId}`,
        });
      }
    }
    return scoped;
  }

  private async appointmentUpcoming(
    dietitianAccountId: string,
    configuration: AutomationConfiguration,
    conditions: AutomationConditions,
    timezone: string,
    localDate: string,
  ): Promise<AutomationCandidate[]> {
    const daysBefore = configuration.timing?.daysBefore ?? 1;
    const targetDate = addLocalDays(localDate, daysBefore);
    const { start, end } = dayBoundsUtc(targetDate, timezone);
    const appointments = await this.prisma.appointment.findMany({
      where: {
        dietitianAccountId,
        status: conditions.appointmentStatus ?? "SCHEDULED",
        startAt: { gte: start, lte: end },
        client: { status: "ACTIVE", archivedAt: null },
      },
    });
    return appointments.map((row) => ({
      triggerKey: `appointment-upcoming:${row.id}:${localDate}`,
      clientId: row.clientId,
      appointmentId: row.id,
    }));
  }

  private async appointmentMissed(
    dietitianAccountId: string,
    configuration: AutomationConfiguration,
    timezone: string,
    localDate: string,
  ): Promise<AutomationCandidate[]> {
    const daysAfter = configuration.timing?.daysAfter ?? 0;
    const targetDate = addLocalDays(localDate, -daysAfter);
    const { end } = dayBoundsUtc(targetDate, timezone);
    const appointments = await this.prisma.appointment.findMany({
      where: {
        dietitianAccountId,
        status: "SCHEDULED",
        endAt: { lte: end },
        client: { status: "ACTIVE", archivedAt: null },
      },
    });
    return appointments.map((row) => ({
      triggerKey: `appointment-missed:${row.id}:${localDate}`,
      clientId: row.clientId,
      appointmentId: row.id,
    }));
  }

  private async clientInactive(
    dietitianAccountId: string,
    configuration: AutomationConfiguration,
    timezone: string,
    localDate: string,
  ): Promise<AutomationCandidate[]> {
    const daysInactive = configuration.timing?.daysInactive ?? 3;
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - daysInactive);

    const clients = await this.prisma.client.findMany({
      where: { dietitianAccountId, status: "ACTIVE", archivedAt: null },
    });
    const candidates: AutomationCandidate[] = [];

    for (const client of clients) {
      const lastActivity = await this.lastClientActivity(dietitianAccountId, client.id);
      if (lastActivity && lastActivity >= cutoff) continue;
      candidates.push({
        triggerKey: `client-inactive:${client.id}:${localDate}`,
        clientId: client.id,
        metadata: { timezone },
      });
    }
    return candidates;
  }

  private async mealPlanEnding(
    dietitianAccountId: string,
    configuration: AutomationConfiguration,
    timezone: string,
    localDate: string,
  ): Promise<AutomationCandidate[]> {
    const daysUntilEnd = configuration.timing?.daysUntilEnd ?? 3;

    const plans = await this.prisma.mealPlan.findMany({
      where: {
        dietitianAccountId,
        status: "ACTIVE",
        archivedAt: null,
        client: { status: "ACTIVE", archivedAt: null },
      },
      include: {
        versions: {
          where: { status: "PUBLISHED", archivedAt: null },
          include: { days: true },
          orderBy: { versionNumber: "desc" },
          take: 1,
        },
      },
    });

    const candidates: AutomationCandidate[] = [];
    for (const plan of plans) {
      const version = plan.versions[0];
      if (!version?.publishedAt) continue;
      const maxDay = version.days.reduce((max, day) => Math.max(max, day.dayNumber), 0);
      if (maxDay <= 0) continue;
      const publishedKey = localDateKey(version.publishedAt, timezone);
      const endKey = addLocalDays(publishedKey, maxDay - 1);
      const windowEnd = addLocalDays(localDate, daysUntilEnd);
      if (endKey < localDate || endKey > windowEnd) continue;
      candidates.push({
        triggerKey: `meal-plan-ending:${plan.id}:${localDate}`,
        clientId: plan.clientId,
        mealPlanId: plan.id,
      });
    }
    return candidates;
  }

  private async invoiceOverdue(
    dietitianAccountId: string,
    conditions: AutomationConditions,
    localDate: string,
  ): Promise<AutomationCandidate[]> {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        dietitianAccountId,
        status: conditions.invoiceStatus ?? "OVERDUE",
        archivedAt: null,
        client: { status: "ACTIVE", archivedAt: null },
      },
    });
    return invoices.map((row) => ({
      triggerKey: `invoice-overdue:${row.id}:${localDate}`,
      clientId: row.clientId,
      invoiceId: row.id,
    }));
  }

  private async taskDue(
    dietitianAccountId: string,
    conditions: AutomationConditions,
    timezone: string,
    localDate: string,
  ): Promise<AutomationCandidate[]> {
    const { start, end } = dayBoundsUtc(localDate, timezone);
    const statusFilter = conditions.taskStatus
      ? conditions.taskStatus
      : undefined;
    const tasks = await this.prisma.task.findMany({
      where: {
        dietitianAccountId,
        archivedAt: null,
        dueAt: { gte: start, lte: end },
        status: statusFilter ?? { in: ["TODO", "IN_PROGRESS"] },
      },
    });
    return tasks.map((row) => ({
      triggerKey: `task-due:${row.id}:${localDate}`,
      clientId: row.clientId ?? undefined,
      taskId: row.id,
    }));
  }

  private async clientCheckinDue(
    rule: AutomationRule,
    configuration: AutomationConfiguration,
    timezone: string,
    localDate: string,
  ): Promise<AutomationCandidate[]> {
    const intervalDays = configuration.timing?.intervalDays ?? 7;
    const clients = await this.prisma.client.findMany({
      where: {
        dietitianAccountId: this.accountId(rule),
        status: "ACTIVE",
        archivedAt: null,
      },
    });
    const candidates: AutomationCandidate[] = [];

    for (const client of clients) {
      const lastRun = await this.prisma.automationRun.findFirst({
        where: {
          dietitianAccountId: this.accountId(rule),
          automationRuleId: rule.id,
          status: "SUCCEEDED",
          triggerKey: { startsWith: `client-checkin:${client.id}:` },
        },
        orderBy: { completedAt: "desc" },
      });
      if (lastRun?.completedAt) {
        const lastKey = localDateKey(lastRun.completedAt, timezone);
        const nextDue = addLocalDays(lastKey, intervalDays);
        if (localDate < nextDue) continue;
      }
      candidates.push({
        triggerKey: `client-checkin:${client.id}:${localDate}`,
        clientId: client.id,
      });
    }
    return candidates;
  }

  private async scheduledDateTime(
    rule: AutomationRule,
    configuration: AutomationConfiguration,
    timezone: string,
    localDate: string,
  ): Promise<AutomationCandidate[]> {
    const localTime = configuration.timing?.localTime;
    if (!localTime) return [];
    const now = new Date();
    const currentLocalTime = now.toLocaleTimeString("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const [targetHour, targetMinute] = localTime.split(":").map(Number);
    const [currentHour, currentMinute] = currentLocalTime.split(":").map(Number);
    if (currentHour !== targetHour || currentMinute !== targetMinute) {
      return [];
    }
    return [
      {
        triggerKey: `scheduled:${rule.id}:${localDate}`,
        metadata: { ruleScope: "organization" },
      },
    ];
  }

  private async lastClientActivity(dietitianAccountId: string, clientId: string): Promise<Date | null> {
    const [food, water, exercise, sleep, habit] = await Promise.all([
      this.prisma.foodLog.findFirst({
        where: { dietitianAccountId, clientId, status: "ACTIVE" },
        orderBy: { consumedAt: "desc" },
        select: { consumedAt: true },
      }),
      this.prisma.waterLog.findFirst({
        where: { dietitianAccountId, clientId, status: "ACTIVE" },
        orderBy: { loggedAt: "desc" },
        select: { loggedAt: true },
      }),
      this.prisma.exerciseLog.findFirst({
        where: { dietitianAccountId, clientId, status: "ACTIVE" },
        orderBy: { performedAt: "desc" },
        select: { performedAt: true },
      }),
      this.prisma.sleepLog.findFirst({
        where: { dietitianAccountId, clientId, status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      this.prisma.habitLog.findFirst({
        where: { dietitianAccountId, clientId, status: "ACTIVE", completed: true },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
    ]);
    const dates = [food?.consumedAt, water?.loggedAt, exercise?.performedAt, sleep?.createdAt, habit?.createdAt].filter(
      Boolean,
    ) as Date[];
    if (!dates.length) return null;
    return new Date(Math.max(...dates.map((d) => d.getTime())));
  }
}

function addLocalDays(localDate: string, days: number): string {
  const date = parseLocalDate(localDate);
  date.setUTCDate(date.getUTCDate() + days);
  return localDateKey(date, "UTC");
}
