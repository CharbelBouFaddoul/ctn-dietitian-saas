import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { FEATURE_KEYS } from "@nutrition-saas/config";
import type {
  AutomationActionType,
  AutomationRuleStatus,
  AutomationTriggerType,
  Prisma,
} from "@prisma/client";
import { z } from "@nutrition-saas/validation";
import { SecurityEventLogger } from "../auth/security-event.logger";
import { EntitlementService } from "../entitlements/entitlement.service";
import { PrismaService } from "../prisma/prisma.service";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
import { tenantWhere } from "../dietitian/tenant-scope";
import { validateRulePayload } from "./automation.schemas";
import { ACTION_LABELS, TRIGGER_LABELS } from "./automation-catalog";
import { AutomationUsageService } from "./automation-usage.service";

@Injectable()
export class AutomationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementService,
    private readonly usage: AutomationUsageService,
    private readonly security: SecurityEventLogger,
  ) {}

  assertCanManage(_tenant: DietitianTenantContext): void {
  }

  async list(tenant: DietitianTenantContext) {
    this.assertCanManage(tenant);
    const rows = await this.prisma.automationRule.findMany({
      where: { ...tenantWhere(tenant.dietitianAccountId), archivedAt: null },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => this.toResponse(row));
  }

  async get(tenant: DietitianTenantContext, automationId: string) {
    this.assertCanManage(tenant);
    const row = await this.findRule(tenant.dietitianAccountId, automationId);
    return this.toResponse(row);
  }

  async create(
    tenant: DietitianTenantContext,
    input: {
      name: string;
      description?: string;
      triggerType: AutomationTriggerType;
      actionType: AutomationActionType;
      configuration: unknown;
      conditions?: unknown;
    },
  ) {
    this.assertCanManage(tenant);
    const { configuration, conditions } = this.validatePayload(input);
    const enabled = await this.entitlements.can(tenant.dietitianAccountId, FEATURE_KEYS.AUTOMATION);
    if (!enabled) {
      throw new ForbiddenException("Automation is not enabled for this organization");
    }

    const rule = await this.prisma.automationRule.create({
      data: {
        dietitianAccountId: tenant.dietitianAccountId,
        name: input.name.trim(),
        description: input.description?.trim() ?? null,
        status: "PAUSED",
        triggerType: input.triggerType,
        actionType: input.actionType,
        configuration: configuration as Prisma.InputJsonObject,
        conditions: conditions as Prisma.InputJsonObject | undefined,
        createdById: tenant.userId,
      },
    });

    await this.security.record({
      type: "automation_rule_created",
      outcome: "success",
      userId: tenant.userId,
      dietitianAccountId: tenant.dietitianAccountId,
      targetType: "automation_rule",
      targetId: rule.id,
    });

    return this.toResponse(rule);
  }

  private validatePayload(input: {
    triggerType: AutomationTriggerType;
    actionType: AutomationActionType;
    configuration: unknown;
    conditions?: unknown;
  }) {
    try {
      return validateRulePayload(input);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException(error.errors.map((e) => e.message).join("; "));
      }
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid automation rule");
    }
  }

  async update(
    tenant: DietitianTenantContext,
    automationId: string,
    input: {
      name?: string;
      description?: string | null;
      triggerType?: AutomationTriggerType;
      actionType?: AutomationActionType;
      configuration?: unknown;
      conditions?: unknown | null;
    },
  ) {
    this.assertCanManage(tenant);
    const existing = await this.findRule(tenant.dietitianAccountId, automationId);
    if (existing.status === "ARCHIVED") {
      throw new BadRequestException("Archived automation rules cannot be edited");
    }

    const triggerType = input.triggerType ?? existing.triggerType;
    const actionType = input.actionType ?? existing.actionType;
    const configuration = input.configuration ?? existing.configuration;
    const conditions = input.conditions === undefined ? existing.conditions : input.conditions;
    const validated = this.validatePayload({ triggerType, actionType, configuration, conditions });

    const rule = await this.prisma.automationRule.update({
      where: { id: automationId },
      data: {
        name: input.name?.trim(),
        description: input.description === undefined ? undefined : input.description,
        triggerType,
        actionType,
        configuration: validated.configuration as Prisma.InputJsonObject,
        conditions: validated.conditions as Prisma.InputJsonObject | undefined,
        updatedById: tenant.userId,
      },
    });

    await this.security.record({
      type: "automation_rule_updated",
      outcome: "success",
      userId: tenant.userId,
      dietitianAccountId: tenant.dietitianAccountId,
      targetType: "automation_rule",
      targetId: rule.id,
    });

    return this.toResponse(rule);
  }

  async activate(tenant: DietitianTenantContext, automationId: string) {
    this.assertCanManage(tenant);
    const existing = await this.findRule(tenant.dietitianAccountId, automationId);
    const enabled = await this.entitlements.can(tenant.dietitianAccountId, FEATURE_KEYS.AUTOMATION);
    if (!enabled) {
      throw new ForbiddenException("Automation is not enabled for this organization");
    }
    const ruleLimit = await this.entitlements.limit(tenant.dietitianAccountId, FEATURE_KEYS.AUTOMATION_RULE_LIMIT);
    if (ruleLimit != null) {
      const activeCount = await this.prisma.automationRule.count({
        where: { ...tenantWhere(tenant.dietitianAccountId), status: "ACTIVE", archivedAt: null },
      });
      if (existing.status !== "ACTIVE" && activeCount >= ruleLimit) {
        throw new ForbiddenException("Active automation rule limit reached");
      }
    }

    const rule = await this.prisma.automationRule.update({
      where: { id: automationId },
      data: { status: "ACTIVE", updatedById: tenant.userId },
    });

    await this.security.record({
      type: "automation_rule_activated",
      outcome: "success",
      userId: tenant.userId,
      dietitianAccountId: tenant.dietitianAccountId,
      targetType: "automation_rule",
      targetId: rule.id,
    });

    return this.toResponse(rule);
  }

  async pause(tenant: DietitianTenantContext, automationId: string) {
    this.assertCanManage(tenant);
    await this.findRule(tenant.dietitianAccountId, automationId);
    const rule = await this.prisma.automationRule.update({
      where: { id: automationId },
      data: { status: "PAUSED", updatedById: tenant.userId },
    });
    await this.security.record({
      type: "automation_rule_paused",
      outcome: "success",
      userId: tenant.userId,
      dietitianAccountId: tenant.dietitianAccountId,
      targetType: "automation_rule",
      targetId: rule.id,
    });
    return this.toResponse(rule);
  }

  async archive(tenant: DietitianTenantContext, automationId: string) {
    this.assertCanManage(tenant);
    await this.findRule(tenant.dietitianAccountId, automationId);
    const rule = await this.prisma.automationRule.update({
      where: { id: automationId },
      data: {
        status: "ARCHIVED",
        archivedAt: new Date(),
        updatedById: tenant.userId,
      },
    });
    await this.security.record({
      type: "automation_rule_archived",
      outcome: "success",
      userId: tenant.userId,
      dietitianAccountId: tenant.dietitianAccountId,
      targetType: "automation_rule",
      targetId: rule.id,
    });
    return this.toResponse(rule);
  }

  async listRunsForRule(tenant: DietitianTenantContext, automationId: string, limit = 50) {
    this.assertCanManage(tenant);
    await this.findRule(tenant.dietitianAccountId, automationId);
    const rows = await this.prisma.automationRun.findMany({
      where: { ...tenantWhere(tenant.dietitianAccountId), automationRuleId: automationId },
      orderBy: { createdAt: "desc" },
      take: Math.min(100, limit),
    });
    return rows.map((row) => this.runToResponse(row));
  }

  async listRuns(tenant: DietitianTenantContext, limit = 50) {
    this.assertCanManage(tenant);
    const rows = await this.prisma.automationRun.findMany({
      where: tenantWhere(tenant.dietitianAccountId),
      orderBy: { createdAt: "desc" },
      take: Math.min(100, limit),
      include: { rule: true },
    });
    return rows.map((row) => ({
      ...this.runToResponse(row),
      ruleName: row.rule.name,
      triggerType: row.rule.triggerType,
      actionType: row.rule.actionType,
    }));
  }

  async getUsage(tenant: DietitianTenantContext) {
    this.assertCanManage(tenant);
    return this.usage.getUsageSummary(tenant.dietitianAccountId);
  }

  async getAdminSummary(dietitianAccountId: string) {
    const scope = tenantWhere(dietitianAccountId);
    const [ruleCount, activeRules, recentFailures, executionCount] = await Promise.all([
      this.prisma.automationRule.count({ where: { ...scope, archivedAt: null } }),
      this.prisma.automationRule.count({ where: { ...scope, status: "ACTIVE", archivedAt: null } }),
      this.prisma.automationRun.count({
        where: {
          ...scope,
          status: "FAILED",
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
      this.usage.getExecutionCount(dietitianAccountId),
    ]);
    return {
      dietitianAccountId,
      ruleCount,
      activeRules,
      recentFailures,
      executionCount: executionCount.executionCount,
      periodKey: executionCount.periodKey,
    };
  }

  summarize(rule: {
    name: string;
    triggerType: AutomationTriggerType;
    actionType: AutomationActionType;
    configuration: unknown;
  }): string {
    const config = rule.configuration as { timing?: Record<string, unknown>; recipient?: string };
    const timing = config.timing ?? {};
    const parts = [
      `When: ${TRIGGER_LABELS[rule.triggerType]}`,
      Object.keys(timing).length ? `Timing: ${JSON.stringify(timing)}` : null,
      `Then: ${ACTION_LABELS[rule.actionType]}`,
      config.recipient ? `To: ${config.recipient}` : null,
    ].filter(Boolean);
    return `${rule.name} — ${parts.join(". ")}`;
  }

  private async findRule(dietitianAccountId: string, automationId: string) {
    const row = await this.prisma.automationRule.findFirst({
      where: { id: automationId, ...tenantWhere(dietitianAccountId) },
    });
    if (!row) {
      throw new NotFoundException("Automation rule not found");
    }
    return row;
  }

  private toResponse(row: {
    id: string;
    dietitianAccountId: string;
    name: string;
    description: string | null;
    status: AutomationRuleStatus;
    triggerType: AutomationTriggerType;
    actionType: AutomationActionType;
    configuration: unknown;
    conditions: unknown;
    createdById: string;
    updatedById: string | null;
    lastRunAt: Date | null;
    archivedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status,
      triggerType: row.triggerType,
      actionType: row.actionType,
      configuration: row.configuration,
      conditions: row.conditions,
      createdById: row.createdById,
      updatedById: row.updatedById,
      lastRunAt: row.lastRunAt?.toISOString() ?? null,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      summary: this.summarize(row),
    };
  }

  private runToResponse(row: {
    id: string;
    dietitianAccountId: string;
    automationRuleId: string;
    status: string;
    triggerKey: string;
    scheduledAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
    retryCount: number;
    errorCode: string | null;
    errorMessage: string | null;
    resultMetadata: unknown;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      automationRuleId: row.automationRuleId,
      status: row.status,
      triggerKey: row.triggerKey,
      scheduledAt: row.scheduledAt.toISOString(),
      startedAt: row.startedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      retryCount: row.retryCount,
      errorCode: row.errorCode,
      errorMessage: row.errorMessage,
      resultMetadata: row.resultMetadata,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
