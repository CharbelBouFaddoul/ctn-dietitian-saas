import { Injectable, Logger } from "@nestjs/common";
import { FEATURE_KEYS } from "@nutrition-saas/config";
import { localDateKey } from "@nutrition-saas/utilities";
import type { AutomationRule, Prisma } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { EmailService } from "../email/email.service";
import { EntitlementService } from "../entitlements/entitlement.service";
import { SubscriptionLifecycleService } from "../entitlements/subscription-lifecycle.service";
import { ConversationService } from "../messaging/conversation.service";
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
    private readonly lifecycle: SubscriptionLifecycleService,
    private readonly usage: AutomationUsageService,
    private readonly templates: AutomationTemplateService,
    private readonly notifications: NotificationService,
    private readonly email: EmailService,
    private readonly tasks: TaskService,
    private readonly conversations: ConversationService,
  ) {}

  async executeCandidate(rule: AutomationRule, candidate: AutomationCandidate): Promise<void> {
    const dietitianAccountId = rule.dietitianAccountId;
    if (!dietitianAccountId) {
      await this.skipRun(rule, candidate.triggerKey, "missing_dietitian_account");
      return;
    }
    const account = await this.prisma.dietitianAccount.findUnique({
      where: { id: dietitianAccountId },
      include: { settings: true },
    });
    if (!account || account.status !== "ACTIVE") {
      await this.skipRun(rule, candidate.triggerKey, "dietitian_inactive");
      return;
    }

    const access = await this.lifecycle.getAccessForAccount(dietitianAccountId);
    if (!this.lifecycle.entitlementsActive(access.accessState)) {
      await this.skipRun(
        rule,
        candidate.triggerKey,
        access.accessState === "READ_ONLY" ? "subscription_read_only" : "subscription_locked",
      );
      return;
    }

    const automationEnabled = await this.entitlements.can(dietitianAccountId, FEATURE_KEYS.AUTOMATION);
    if (!automationEnabled) {
      await this.skipRun(rule, candidate.triggerKey, "entitlement_denied");
      return;
    }

    const executionLimit = await this.entitlements.limit(
      dietitianAccountId,
      FEATURE_KEYS.AUTOMATION_EXECUTION_LIMIT,
    );
    if (executionLimit != null) {
      const reservation = await this.usage.reserveExecution(dietitianAccountId, executionLimit);
      if (!reservation.allowed) {
        await this.skipRun(rule, candidate.triggerKey, "execution_limit");
        return;
      }
    }

    const existing = await this.prisma.automationRun.findUnique({
      where: {
        dietitianAccountId_triggerKey: {
          dietitianAccountId,
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
            dietitianAccountId,
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
          where: { id: candidate.clientId, dietitianAccountId },
        });
        if (!client || client.status !== "ACTIVE" || client.archivedAt) {
          await this.completeRun(runId, rule.id, "SKIPPED", "client_inactive", "Client is not active");
          return;
        }
      }

      const configuration = rule.configuration as AutomationConfiguration;
      const context = await this.buildContext(
        rule,
        candidate,
        account.displayName,
        account.settings?.timezone ?? "UTC",
        dietitianAccountId,
        account.userId,
      );
      await this.performAction(rule, configuration, context, candidate, runId, dietitianAccountId);

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
    context: TemplateContext & { recipientUserId: string; recipientEmail?: string | null; assignedUserId?: string },
    candidate: AutomationCandidate,
    runId: string,
    dietitianAccountId: string,
  ): Promise<void> {
    switch (rule.actionType) {
      case "SEND_IN_APP_NOTIFICATION":
      case "CREATE_CLIENT_NOTIFICATION": {
        const title = this.templates.render(configuration.notificationTitle!, context);
        const body = this.templates.render(configuration.notificationBody!, context);
        const userIds = await this.resolveNotificationUserIds(
          configuration,
          candidate,
          context.assignedUserId ?? context.recipientUserId,
          context.recipientUserId,
        );
        for (const userId of userIds) {
          await this.notifications.create({
            dietitianAccountId,
            userId,
            clientId: candidate.clientId,
            type: "AUTOMATION",
            title,
            body,
            targetType: "automation_run",
            targetId: runId,
            metadata: { ruleId: rule.id, ruleName: rule.name, source: "automation" },
          });
        }
        break;
      }
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
          dietitianAccountId,
          createdById: rule.createdById,
          clientId: candidate.clientId,
          assignedUserId: context.assignedUserId,
          title: this.templates.render(configuration.taskTitle!, context),
          description: configuration.taskDescription
            ? this.templates.render(configuration.taskDescription, context)
            : undefined,
          priority: configuration.taskPriority,
          automationRuleId: rule.id,
          automationRunId: runId,
        });
        break;
      case "SEND_MESSAGE": {
        if (!candidate.clientId) throw new Error("client_required");
        if (!context.assignedUserId) throw new Error("sender_missing");
        const client = await this.prisma.client.findUniqueOrThrow({ where: { id: candidate.clientId } });
        const conversation = await this.conversations.getOrCreate(client);
        const portalAccount = await this.prisma.clientAccount.findFirst({
          where: { clientId: client.id, status: "ACTIVE" },
          select: { userId: true },
        });
        await this.conversations.sendMessage({
          conversation,
          client,
          senderUserId: context.assignedUserId,
          body: this.templates.render(configuration.messageBody!, context),
          notifyUserIds: portalAccount ? [portalAccount.userId] : [],
          senderIsClient: false,
        });
        break;
      }
    }
  }

  private async buildContext(
    rule: AutomationRule,
    candidate: AutomationCandidate,
    organizationName: string,
    timezone: string,
    dietitianAccountId: string,
    accountUserId: string,
  ): Promise<TemplateContext & { recipientUserId: string; recipientEmail?: string | null; assignedUserId?: string }> {
    const configuration = rule.configuration as AutomationConfiguration;
    const context: TemplateContext = {
      organization: { name: organizationName },
      rule: { name: rule.name },
      run: { date: localDateKey(new Date(), timezone) },
    };

    const owner = await this.prisma.user.findUniqueOrThrow({ where: { id: accountUserId } });
    context.dietitian = {
      name: owner.firstName?.trim() || owner.email.split("@")[0] || "Dietitian",
    };
    const assignedUserId = accountUserId;

    if (candidate.clientId) {
      const client = await this.prisma.client.findUniqueOrThrow({ where: { id: candidate.clientId } });
      context.client = {
        firstName: client.firstName,
        lastName: client.lastName,
        displayName: client.displayName ?? `${client.firstName} ${client.lastName}`,
      };
      if (rule.triggerType === "CLIENT_INACTIVE") {
        const lastActivity = await this.lastClientActivity(dietitianAccountId, candidate.clientId);
        context.client.lastActivityDate = lastActivity ? localDateKey(lastActivity, timezone) : "";
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
        title: appointment.title,
      };
    }

    if (candidate.invoiceId) {
      const invoice = await this.prisma.invoice.findUniqueOrThrow({ where: { id: candidate.invoiceId } });
      context.invoice = {
        number: invoice.invoiceNumber ?? invoice.id.slice(0, 8),
        amount: `${invoice.currency} ${Number(invoice.total).toFixed(2)}`,
        dueDate: invoice.dueDate ? localDateKey(invoice.dueDate, timezone) : "",
      };
    }

    if (candidate.taskId) {
      const task = await this.prisma.task.findUniqueOrThrow({ where: { id: candidate.taskId } });
      context.task = {
        title: task.title,
        dueDate: task.dueAt ? localDateKey(task.dueAt, timezone) : "",
      };
    }

    if (candidate.mealPlanId) {
      const mealPlan = await this.prisma.mealPlan.findUniqueOrThrow({
        where: { id: candidate.mealPlanId },
        include: {
          versions: {
            where: { status: "PUBLISHED", archivedAt: null },
            include: { days: { select: { dayNumber: true } } },
            orderBy: { versionNumber: "desc" },
            take: 1,
          },
        },
      });
      const version = mealPlan.versions[0];
      let endDate = "";
      if (version?.publishedAt) {
        const maxDay = version.days.reduce((max, day) => Math.max(max, day.dayNumber), 0);
        if (maxDay > 0) {
          const publishedKey = localDateKey(version.publishedAt, timezone);
          const end = new Date(`${publishedKey}T00:00:00.000Z`);
          end.setUTCDate(end.getUTCDate() + maxDay - 1);
          endDate = localDateKey(end, "UTC");
        }
      }
      context.mealPlan = {
        name: mealPlan.name,
        lastUpdateDate: localDateKey(mealPlan.updatedAt, timezone),
        endDate,
      };
    }

    const recipient =
      rule.actionType === "CREATE_TASK"
        ? {
            recipientUserId: rule.createdById,
            recipientEmail: (await this.prisma.user.findUniqueOrThrow({ where: { id: rule.createdById } })).email,
          }
        : await this.resolveRecipient(rule, configuration, candidate, assignedUserId, owner);
    return { ...context, ...recipient, assignedUserId };
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

  /** User IDs that should receive an in-app / portal notification for this run. */
  private async resolveNotificationUserIds(
    configuration: AutomationConfiguration,
    candidate: AutomationCandidate,
    clinicUserId: string,
    primaryRecipientUserId: string,
  ): Promise<string[]> {
    if (configuration.recipient === "BOTH") {
      const ids = new Set<string>([clinicUserId]);
      if (candidate.clientId) {
        const account = await this.prisma.clientAccount.findFirst({
          where: { clientId: candidate.clientId, status: "ACTIVE" },
          select: { userId: true },
        });
        if (account) ids.add(account.userId);
      }
      return [...ids];
    }
    return [primaryRecipientUserId];
  }

  private async resolveRecipient(
    rule: AutomationRule,
    configuration: AutomationConfiguration,
    candidate: AutomationCandidate,
    assignedUserId: string,
    owner: { id: string; email: string },
  ): Promise<{ recipientUserId: string; recipientEmail?: string | null }> {
    switch (configuration.recipient) {
      case "RULE_CREATOR": {
        const user = await this.prisma.user.findUniqueOrThrow({ where: { id: rule.createdById } });
        return { recipientUserId: user.id, recipientEmail: user.email };
      }
      case "ASSIGNED_DIETITIAN":
      case "SPECIFIC_MEMBER":
        // Phase 1: only account owner exists; SPECIFIC_MEMBER resolves to owner.
        return { recipientUserId: assignedUserId, recipientEmail: owner.email };
      case "CLIENT": {
        if (!candidate.clientId) throw new Error("client_required");
        const account = await this.prisma.clientAccount.findFirst({
          where: { clientId: candidate.clientId, status: "ACTIVE" },
          include: { user: true },
        });
        if (!account) throw new Error("client_account_missing");
        return { recipientUserId: account.userId, recipientEmail: account.user.email };
      }
      case "BOTH":
        return { recipientUserId: assignedUserId, recipientEmail: owner.email };
      default:
        throw new Error("invalid_recipient");
    }
  }

  private async skipRun(rule: AutomationRule, triggerKey: string, reason: string): Promise<void> {
    const dietitianAccountId = rule.dietitianAccountId;
    try {
      await this.prisma.automationRun.create({
        data: {
          dietitianAccountId,
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
