import { Injectable, Logger } from "@nestjs/common";
import { FEATURE_KEYS } from "@nutrition-saas/config";
import { localDateKey } from "@nutrition-saas/utilities";
import type { AutomationRule, Prisma } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { EmailService } from "../email/email.service";
import { EntitlementService } from "../entitlements/entitlement.service";
import { NotificationService } from "../notifications/notification.service";
import { PrismaService } from "../prisma/prisma.service";
import { TaskService } from "../tasks/task.service";
import type { AutomationCandidate } from "./automation-evaluator.service";
import type { AutomationConfiguration } from "./automation.schemas";
import { AutomationTemplateService, type TemplateContext } from "./automation-template.service";
import { AutomationUsageService } from "./automation-usage.service";

const MAX_RETRIES = 3;

@Injectable()
export class AutomationExecutorService {
  private readonly logger = new Logger(AutomationExecutorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementService,
    private readonly usage: AutomationUsageService,
    private readonly templates: AutomationTemplateService,
    private readonly notifications: NotificationService,
    private readonly email: EmailService,
    private readonly tasks: TaskService,
  ) {}

  async executeCandidate(rule: AutomationRule, candidate: AutomationCandidate): Promise<void> {
    const org = await this.prisma.organization.findUnique({
      where: { id: rule.organizationId },
      include: { settings: true },
    });
    if (!org || org.status !== "ACTIVE") {
      await this.skipRun(rule, candidate.triggerKey, "organization_inactive");
      return;
    }

    const automationEnabled = await this.entitlements.can(rule.organizationId, FEATURE_KEYS.AUTOMATION);
    if (!automationEnabled) {
      await this.skipRun(rule, candidate.triggerKey, "entitlement_denied");
      return;
    }

    const executionLimit = await this.entitlements.limit(
      rule.organizationId,
      FEATURE_KEYS.AUTOMATION_EXECUTION_LIMIT,
    );
    if (executionLimit != null) {
      const reservation = await this.usage.reserveExecution(rule.organizationId, executionLimit);
      if (!reservation.allowed) {
        await this.skipRun(rule, candidate.triggerKey, "execution_limit");
        return;
      }
    }

    const existing = await this.prisma.automationRun.findUnique({
      where: {
        organizationId_triggerKey: {
          organizationId: rule.organizationId,
          triggerKey: candidate.triggerKey,
        },
      },
    });
    if (existing && (existing.status === "SUCCEEDED" || existing.status === "SKIPPED")) {
      return;
    }
    if (existing?.status === "FAILED" && existing.retryCount >= MAX_RETRIES) {
      return;
    }

    let runId: string;
    try {
      if (existing) {
        const updated = await this.prisma.automationRun.update({
          where: { id: existing.id },
          data: {
            status: "RUNNING",
            startedAt: new Date(),
            retryCount: { increment: 1 },
            errorCode: null,
            errorMessage: null,
          },
        });
        runId = updated.id;
      } else {
        const created = await this.prisma.automationRun.create({
          data: {
            organizationId: rule.organizationId,
            automationRuleId: rule.id,
            triggerKey: candidate.triggerKey,
            status: "RUNNING",
            startedAt: new Date(),
          },
        });
        runId = created.id;
      }
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === "P2002") {
        return;
      }
      throw error;
    }

    try {
      if (candidate.clientId) {
        const client = await this.prisma.client.findFirst({
          where: { id: candidate.clientId, organizationId: rule.organizationId },
        });
        if (!client || client.status !== "ACTIVE" || client.archivedAt) {
          await this.completeRun(runId, rule.id, "SKIPPED", "client_inactive", "Client is not active");
          return;
        }
      }

      const configuration = rule.configuration as AutomationConfiguration;
      const context = await this.buildContext(rule, candidate, org.name, org.settings?.timezone ?? "UTC");
      await this.performAction(rule, configuration, context, candidate, runId);

      await this.completeRun(runId, rule.id, "SUCCEEDED", null, null, {
        action: rule.actionType,
        triggerKey: candidate.triggerKey,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : "execution_failed";
      const code = error instanceof Error && "code" in error ? String((error as { code: string }).code) : "execution_error";
      await this.completeRun(runId, rule.id, "FAILED", code, message);
      this.logger.warn(`Automation run ${runId} failed: ${message}`);
    }
  }

  private async performAction(
    rule: AutomationRule,
    configuration: AutomationConfiguration,
    context: TemplateContext & { recipientUserId: string; recipientEmail?: string | null; assignedMemberId?: string },
    candidate: AutomationCandidate,
    runId: string,
  ): Promise<void> {
    switch (rule.actionType) {
      case "SEND_IN_APP_NOTIFICATION":
        await this.notifications.create({
          organizationId: rule.organizationId,
          userId: context.recipientUserId,
          clientId: candidate.clientId,
          type: "AUTOMATION",
          title: this.templates.render(configuration.notificationTitle!, context),
          body: this.templates.render(configuration.notificationBody!, context),
          targetType: "automation_run",
          targetId: runId,
          metadata: { ruleId: rule.id, ruleName: rule.name, source: "automation" },
        });
        break;
      case "CREATE_CLIENT_NOTIFICATION":
        await this.notifications.create({
          organizationId: rule.organizationId,
          userId: context.recipientUserId,
          clientId: candidate.clientId,
          type: "AUTOMATION",
          title: this.templates.render(configuration.notificationTitle!, context),
          body: this.templates.render(configuration.notificationBody!, context),
          targetType: "automation_run",
          targetId: runId,
          metadata: { ruleId: rule.id, ruleName: rule.name, source: "automation" },
        });
        break;
      case "SEND_EMAIL": {
        const to = context.recipientEmail;
        if (!to) {
          throw new Error("recipient_email_missing");
        }
        await this.email.sendAutomationMessage(
          to,
          this.templates.render(configuration.emailSubject!, context),
          this.templates.render(configuration.emailBody!, context),
        );
        break;
      }
      case "CREATE_TASK":
        await this.tasks.createFromAutomation({
          organizationId: rule.organizationId,
          createdById: rule.createdById,
          clientId: candidate.clientId,
          assignedMemberId: context.assignedMemberId,
          title: this.templates.render(configuration.taskTitle!, context),
          description: configuration.taskDescription
            ? this.templates.render(configuration.taskDescription, context)
            : undefined,
          priority: configuration.taskPriority,
          automationRuleId: rule.id,
          automationRunId: runId,
        });
        break;
    }
  }

  private async buildContext(
    rule: AutomationRule,
    candidate: AutomationCandidate,
    organizationName: string,
    timezone: string,
  ): Promise<TemplateContext & { recipientUserId: string; recipientEmail?: string | null; assignedMemberId?: string }> {
    const configuration = rule.configuration as AutomationConfiguration;
    const context: TemplateContext = {
      organization: { name: organizationName },
      rule: { name: rule.name },
    };

    let assignedMemberId: string | undefined;
    if (candidate.clientId) {
      const client = await this.prisma.client.findUniqueOrThrow({ where: { id: candidate.clientId } });
      context.client = {
        firstName: client.firstName,
        lastName: client.lastName,
        displayName: client.displayName ?? `${client.firstName} ${client.lastName}`,
      };
      const assignment = await this.prisma.clientAssignment.findFirst({
        where: {
          clientId: candidate.clientId,
          organizationId: rule.organizationId,
          unassignedAt: null,
        },
        include: { organizationMember: { include: { user: true } } },
      });
      if (assignment) {
        assignedMemberId = assignment.organizationMemberId;
        context.dietitian = {
          name: assignment.organizationMember.user.email.split("@")[0] ?? "Dietitian",
        };
      }
    }

    if (candidate.appointmentId) {
      const appointment = await this.prisma.appointment.findUniqueOrThrow({
        where: { id: candidate.appointmentId },
      });
      context.appointment = {
        date: localDateKey(appointment.startAt, timezone),
        time: appointment.startAt.toLocaleTimeString("en-GB", {
          timeZone: timezone,
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
    }

    if (candidate.invoiceId) {
      const invoice = await this.prisma.invoice.findUniqueOrThrow({ where: { id: candidate.invoiceId } });
      context.invoice = { number: invoice.invoiceNumber ?? invoice.id.slice(0, 8) };
    }

    if (candidate.taskId) {
      const task = await this.prisma.task.findUniqueOrThrow({ where: { id: candidate.taskId } });
      context.task = { title: task.title };
    }

    if (candidate.mealPlanId) {
      const mealPlan = await this.prisma.mealPlan.findUniqueOrThrow({ where: { id: candidate.mealPlanId } });
      context.mealPlan = { name: mealPlan.name };
    }

    const recipient =
      rule.actionType === "CREATE_TASK"
        ? {
            recipientUserId: rule.createdById,
            recipientEmail: (await this.prisma.user.findUniqueOrThrow({ where: { id: rule.createdById } })).email,
          }
        : await this.resolveRecipient(rule, configuration, candidate, assignedMemberId);
    return { ...context, ...recipient, assignedMemberId };
  }

  private async resolveRecipient(
    rule: AutomationRule,
    configuration: AutomationConfiguration,
    candidate: AutomationCandidate,
    assignedMemberId?: string,
  ): Promise<{ recipientUserId: string; recipientEmail?: string | null }> {
    switch (configuration.recipient) {
      case "RULE_CREATOR": {
        const user = await this.prisma.user.findUniqueOrThrow({ where: { id: rule.createdById } });
        return { recipientUserId: user.id, recipientEmail: user.email };
      }
      case "ASSIGNED_DIETITIAN": {
        if (!assignedMemberId) throw new Error("no_assigned_dietitian");
        const member = await this.prisma.organizationMember.findUniqueOrThrow({
          where: { id: assignedMemberId },
          include: { user: true },
        });
        return { recipientUserId: member.userId, recipientEmail: member.user.email };
      }
      case "CLIENT": {
        if (!candidate.clientId) throw new Error("client_required");
        const account = await this.prisma.clientAccount.findFirst({
          where: { clientId: candidate.clientId, status: "ACTIVE" },
          include: { user: true },
        });
        if (!account) throw new Error("client_account_missing");
        return { recipientUserId: account.userId, recipientEmail: account.user.email };
      }
      case "SPECIFIC_MEMBER": {
        const member = await this.prisma.organizationMember.findFirstOrThrow({
          where: { id: configuration.memberId!, organizationId: rule.organizationId },
          include: { user: true },
        });
        return { recipientUserId: member.userId, recipientEmail: member.user.email };
      }
      default:
        throw new Error("invalid_recipient");
    }
  }

  private async skipRun(rule: AutomationRule, triggerKey: string, reason: string): Promise<void> {
    try {
      await this.prisma.automationRun.create({
        data: {
          organizationId: rule.organizationId,
          automationRuleId: rule.id,
          triggerKey,
          status: "SKIPPED",
          completedAt: new Date(),
          errorCode: reason,
          resultMetadata: { reason },
        },
      });
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === "P2002") {
        return;
      }
      throw error;
    }
    await this.prisma.automationRule.update({
      where: { id: rule.id },
      data: { lastRunAt: new Date() },
    });
  }

  private async completeRun(
    runId: string,
    ruleId: string,
    status: "SUCCEEDED" | "FAILED" | "SKIPPED",
    errorCode: string | null,
    errorMessage: string | null,
    resultMetadata?: Prisma.InputJsonObject,
  ): Promise<void> {
    await this.prisma.automationRun.update({
      where: { id: runId },
      data: {
        status,
        completedAt: new Date(),
        errorCode,
        errorMessage,
        resultMetadata,
      },
    });
    await this.prisma.automationRule.update({
      where: { id: ruleId },
      data: { lastRunAt: new Date() },
    });
  }
}
