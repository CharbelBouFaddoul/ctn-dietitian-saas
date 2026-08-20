import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  MembershipStatus,
  OrganizationRole,
  type Organization,
  type OrganizationMember,
  type OrganizationSettings,
  type Prisma,
  type User,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export type DietitianAccountBackfillSummary = {
  accountsCreated: number;
  accountsReused: number;
  settingsCreated: number;
  clientsUpdated: number;
  clientAccountsUpdated: number;
  orgAssetsUpdated: number;
  sequencesCopied: number;
  aiUsageCopied: number;
  automationUsageCopied: number;
  appointmentsRemapped: number;
  tasksRemapped: number;
  automationsRewritten: number;
  invitationsUpdated: number;
};

type MemberWithUser = OrganizationMember & { user: User };

type OrgWithRelations = Organization & {
  settings: OrganizationSettings | null;
  members: MemberWithUser[];
};

const DEFAULT_SETTINGS = {
  timezone: "UTC",
  locale: "en",
  currency: "USD",
  weightUnit: "kg" as const,
  heightUnit: "cm" as const,
  dateFormat: "YYYY_MM_DD" as const,
  practiceName: null as string | null,
  logoStorageKey: null as string | null,
  contactEmail: null as string | null,
  contactPhone: null as string | null,
  addressLine1: null as string | null,
  addressLine2: null as string | null,
  city: null as string | null,
  region: null as string | null,
  postalCode: null as string | null,
  country: null as string | null,
  defaultAppointmentMinutes: 60,
  reminderEmailEnabled: true,
  reminderHoursBefore: 24,
  invoiceDefaultDueDays: 14,
  invoiceFooter: null as string | null,
  emailFromName: null as string | null,
  emailReplyTo: null as string | null,
};

const CLIENT_SCOPED_TABLES = [
  "client_profiles",
  "client_goals",
  "client_tags",
  "client_measurements",
  "client_assignments",
  "timeline_events",
  "assessments",
  "appointments",
  "meal_plans",
  "food_logs",
  "water_logs",
  "exercise_logs",
  "sleep_logs",
  "habit_logs",
  "conversations",
  "messages",
  "documents",
  "invoices",
  "tasks",
  "ai_requests",
  "notifications",
] as const;

@Injectable()
export class DietitianAccountBackfillService {
  private readonly logger = new Logger(DietitianAccountBackfillService.name);

  constructor(private readonly prisma: PrismaService) {}

  async run(): Promise<DietitianAccountBackfillSummary> {
    await this.preflight();

    const summary: DietitianAccountBackfillSummary = {
      accountsCreated: 0,
      accountsReused: 0,
      settingsCreated: 0,
      clientsUpdated: 0,
      clientAccountsUpdated: 0,
      orgAssetsUpdated: 0,
      sequencesCopied: 0,
      aiUsageCopied: 0,
      automationUsageCopied: 0,
      appointmentsRemapped: 0,
      tasksRemapped: 0,
      automationsRewritten: 0,
      invitationsUpdated: 0,
    };

    const existingAccounts = await this.prisma.dietitianAccount.findMany({
      select: { id: true, userId: true },
    });
    const accountByUserId = new Map(existingAccounts.map((a) => [a.userId, a.id]));

    const orgs = await this.prisma.organization.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        settings: true,
        members: {
          include: { user: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    // memberId -> accountId (for assignee resolution across orgs processed)
    const accountByMemberId = new Map<string, string>();

    for (const org of orgs as OrgWithRelations[]) {
      const owners = org.members.filter(
        (m) => m.status === MembershipStatus.ACTIVE && m.role === OrganizationRole.OWNER,
      );
      const dietitians = org.members.filter(
        (m) => m.status === MembershipStatus.ACTIVE && m.role === OrganizationRole.DIETITIAN,
      );

      for (const member of [...owners, ...dietitians]) {
        const { accountId, created, reused } = await this.ensureAccount(
          org,
          member,
          member.role,
          accountByUserId,
        );
        accountByUserId.set(member.userId, accountId);
        accountByMemberId.set(member.id, accountId);
        if (created) summary.accountsCreated += 1;
        if (reused) summary.accountsReused += 1;

        const settingsCreated = await this.ensureSettings(accountId, org.settings);
        if (settingsCreated) summary.settingsCreated += 1;
      }

      const ownerMember = owners[0];
      const ownerAccountId = ownerMember
        ? accountByUserId.get(ownerMember.userId) ?? null
        : null;

      if (ownerAccountId) {
        const assets = await this.backfillOwnerAssets(org.id, ownerAccountId);
        summary.orgAssetsUpdated += assets.orgAssetsUpdated;
        summary.sequencesCopied += assets.sequencesCopied;
        summary.aiUsageCopied += assets.aiUsageCopied;
        summary.automationUsageCopied += assets.automationUsageCopied;
      }

      const clients = await this.prisma.client.findMany({
        where: { organizationId: org.id },
        select: { id: true, dietitianAccountId: true },
      });

      for (const client of clients) {
        if (client.dietitianAccountId) continue;

        const targetAccountId = await this.resolveClientAccountId({
          clientId: client.id,
          organizationId: org.id,
          ownerAccountId,
          accountByMemberId,
        });

        if (!targetAccountId) {
          throw new Error(
            `Cannot resolve DietitianAccount for client ${client.id} in org ${org.id} (no OWNER and no assignee account)`,
          );
        }

        await this.prisma.client.update({
          where: { id: client.id },
          data: { dietitianAccountId: targetAccountId },
        });
        summary.clientsUpdated += 1;

        await this.updateClientScopedRows(client.id, targetAccountId);
        await this.updateMealPlanTreeForClient(client.id, targetAccountId);
        await this.updateInvoiceItemsForClient(client.id, targetAccountId);
        await this.updateConversationReadStatesForClient(client.id, targetAccountId);

        const ca = await this.prisma.clientAccount.updateMany({
          where: { clientId: client.id, dietitianAccountId: null },
          data: { dietitianAccountId: targetAccountId },
        });
        summary.clientAccountsUpdated += ca.count;
      }

      // STAFF / inactive members: no accounts; map their member ids to OWNER for assignee remap
      if (ownerAccountId) {
        for (const member of org.members) {
          if (!accountByMemberId.has(member.id)) {
            accountByMemberId.set(member.id, ownerAccountId);
          }
        }
      }
    }

    const assignee = await this.remapAssignees();
    summary.appointmentsRemapped += assignee.appointmentsRemapped;
    summary.tasksRemapped += assignee.tasksRemapped;

    summary.automationsRewritten += await this.rewriteAutomationConfigs();
    summary.invitationsUpdated += await this.backfillInvitations(accountByUserId);

    this.logger.log(`DietitianAccount backfill complete: ${JSON.stringify(summary)}`);
    return summary;
  }

  private async preflight(): Promise<void> {
    const rows = await this.prisma.$queryRaw<Array<{ user_id: string; cnt: bigint }>>`
      SELECT user_id, COUNT(*)::bigint AS cnt
      FROM organization_members
      WHERE status = 'ACTIVE'
        AND role IN ('OWNER', 'DIETITIAN')
      GROUP BY user_id
      HAVING COUNT(*) > 1
    `;

    if (rows.length > 0) {
      const details = rows
        .map((r) => `${r.user_id} (${r.cnt.toString()} memberships)`)
        .join(", ");
      throw new Error(
        `DietitianAccount backfill preflight failed: user(s) have >1 ACTIVE OWNER/DIETITIAN membership: ${details}`,
      );
    }
  }

  private async ensureAccount(
    org: Organization,
    member: MemberWithUser,
    role: OrganizationRole,
    accountByUserId: Map<string, string>,
  ): Promise<{ accountId: string; created: boolean; reused: boolean }> {
    const existingId = accountByUserId.get(member.userId);
    if (existingId) {
      return { accountId: existingId, created: false, reused: true };
    }

    const byDb = await this.prisma.dietitianAccount.findUnique({
      where: { userId: member.userId },
      select: { id: true },
    });
    if (byDb) {
      return { accountId: byDb.id, created: false, reused: true };
    }

    const displayName = this.displayNameFor(member.user, org.name);
    const now = new Date();

    if (role === OrganizationRole.OWNER) {
      // OWNER DietitianAccount.id = Organization.id
      const created = await this.prisma.dietitianAccount.create({
        data: {
          id: org.id,
          userId: member.userId,
          displayName: org.name,
          slug: org.slug,
          status: "ACTIVE",
          legacyOrganizationId: org.id,
          createdAt: now,
          updatedAt: now,
        },
      });
      return { accountId: created.id, created: true, reused: false };
    }

    // DIETITIAN: new UUID + unique slug
    const id = randomUUID();
    const slug = await this.allocateSlug(`${org.slug}-${id.slice(0, 8)}`);
    const created = await this.prisma.dietitianAccount.create({
      data: {
        id,
        userId: member.userId,
        displayName,
        slug,
        status: "ACTIVE",
        legacyOrganizationId: org.id,
        createdAt: now,
        updatedAt: now,
      },
    });
    return { accountId: created.id, created: true, reused: false };
  }

  private displayNameFor(user: User, fallback: string): string {
    const parts = [user.firstName, user.lastName].filter(Boolean);
    if (parts.length) return parts.join(" ");
    return user.email || fallback;
  }

  private async allocateSlug(base: string): Promise<string> {
    let candidate = base.slice(0, 48);
    let n = 0;
    while (await this.prisma.dietitianAccount.findUnique({ where: { slug: candidate } })) {
      n += 1;
      const suffix = `-${n}`;
      candidate = `${base.slice(0, Math.max(1, 48 - suffix.length))}${suffix}`;
    }
    return candidate;
  }

  private async ensureSettings(
    dietitianAccountId: string,
    orgSettings: OrganizationSettings | null,
  ): Promise<boolean> {
    const existing = await this.prisma.dietitianSettings.findUnique({
      where: { dietitianAccountId },
    });
    if (existing) return false;

    const source = orgSettings
      ? {
          timezone: orgSettings.timezone,
          locale: orgSettings.locale,
          currency: orgSettings.currency,
          weightUnit: orgSettings.weightUnit,
          heightUnit: orgSettings.heightUnit,
          dateFormat: orgSettings.dateFormat,
          practiceName: orgSettings.practiceName,
          logoStorageKey: orgSettings.logoStorageKey,
          contactEmail: orgSettings.contactEmail,
          contactPhone: orgSettings.contactPhone,
          addressLine1: orgSettings.addressLine1,
          addressLine2: orgSettings.addressLine2,
          city: orgSettings.city,
          region: orgSettings.region,
          postalCode: orgSettings.postalCode,
          country: orgSettings.country,
          defaultAppointmentMinutes: orgSettings.defaultAppointmentMinutes,
          reminderEmailEnabled: orgSettings.reminderEmailEnabled,
          reminderHoursBefore: orgSettings.reminderHoursBefore,
          invoiceDefaultDueDays: orgSettings.invoiceDefaultDueDays,
          invoiceFooter: orgSettings.invoiceFooter,
          emailFromName: orgSettings.emailFromName,
          emailReplyTo: orgSettings.emailReplyTo,
        }
      : DEFAULT_SETTINGS;

    await this.prisma.dietitianSettings.create({
      data: {
        dietitianAccountId,
        ...source,
      },
    });
    return true;
  }

  private async resolveClientAccountId(input: {
    clientId: string;
    organizationId: string;
    ownerAccountId: string | null;
    accountByMemberId: Map<string, string>;
  }): Promise<string | null> {
    const active = await this.prisma.clientAssignment.findFirst({
      where: {
        clientId: input.clientId,
        organizationId: input.organizationId,
        unassignedAt: null,
      },
      include: { organizationMember: true },
      orderBy: { assignedAt: "desc" },
    });

    if (active) {
      const role = active.organizationMember.role;
      if (role === OrganizationRole.STAFF) {
        return input.ownerAccountId;
      }
      return (
        input.accountByMemberId.get(active.organizationMemberId) ??
        input.ownerAccountId
      );
    }

    return input.ownerAccountId;
  }

  private async updateClientScopedRows(
    clientId: string,
    dietitianAccountId: string,
  ): Promise<void> {
    for (const table of CLIENT_SCOPED_TABLES) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE "${table}" SET dietitian_account_id = $1::uuid WHERE client_id = $2::uuid AND dietitian_account_id IS NULL`,
        dietitianAccountId,
        clientId,
      );
    }
  }

  private async updateMealPlanTreeForClient(
    clientId: string,
    dietitianAccountId: string,
  ): Promise<void> {
    const plans = await this.prisma.mealPlan.findMany({
      where: { clientId },
      select: { id: true },
    });
    if (!plans.length) return;

    const planIds = plans.map((p) => p.id);
    await this.prisma.mealPlan.updateMany({
      where: { id: { in: planIds }, dietitianAccountId: null },
      data: { dietitianAccountId },
    });

    const versions = await this.prisma.mealPlanVersion.findMany({
      where: { mealPlanId: { in: planIds } },
      select: { id: true },
    });
    const versionIds = versions.map((v) => v.id);
    if (versionIds.length) {
      await this.prisma.mealPlanVersion.updateMany({
        where: { id: { in: versionIds }, dietitianAccountId: null },
        data: { dietitianAccountId },
      });

      const days = await this.prisma.mealPlanDay.findMany({
        where: { mealPlanVersionId: { in: versionIds } },
        select: { id: true },
      });
      const dayIds = days.map((d) => d.id);
      if (dayIds.length) {
        await this.prisma.mealPlanDay.updateMany({
          where: { id: { in: dayIds }, dietitianAccountId: null },
          data: { dietitianAccountId },
        });

        const meals = await this.prisma.meal.findMany({
          where: { mealPlanDayId: { in: dayIds } },
          select: { id: true },
        });
        const mealIds = meals.map((m) => m.id);
        if (mealIds.length) {
          await this.prisma.meal.updateMany({
            where: { id: { in: mealIds }, dietitianAccountId: null },
            data: { dietitianAccountId },
          });
          await this.prisma.mealItem.updateMany({
            where: { mealId: { in: mealIds }, dietitianAccountId: null },
            data: { dietitianAccountId },
          });
        }
      }
    }
  }

  private async updateInvoiceItemsForClient(
    clientId: string,
    dietitianAccountId: string,
  ): Promise<void> {
    const invoices = await this.prisma.invoice.findMany({
      where: { clientId },
      select: { id: true },
    });
    if (!invoices.length) return;
    await this.prisma.invoiceItem.updateMany({
      where: { invoiceId: { in: invoices.map((i) => i.id) }, dietitianAccountId: null },
      data: { dietitianAccountId },
    });
  }

  private async updateConversationReadStatesForClient(
    clientId: string,
    dietitianAccountId: string,
  ): Promise<void> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { clientId },
      select: { id: true },
    });
    if (!conversation) return;
    await this.prisma.conversationReadState.updateMany({
      where: { conversationId: conversation.id, dietitianAccountId: null },
      data: { dietitianAccountId },
    });
  }

  private async backfillOwnerAssets(
    organizationId: string,
    ownerAccountId: string,
  ): Promise<{
    orgAssetsUpdated: number;
    sequencesCopied: number;
    aiUsageCopied: number;
    automationUsageCopied: number;
  }> {
    let orgAssetsUpdated = 0;

    const touch = async (count: number) => {
      orgAssetsUpdated += count;
    };

    await touch(
      (
        await this.prisma.subscription.updateMany({
          where: { organizationId, dietitianAccountId: null },
          data: { dietitianAccountId: ownerAccountId },
        })
      ).count,
    );
    await touch(
      (
        await this.prisma.featureOverride.updateMany({
          where: { organizationId, dietitianAccountId: null },
          data: { dietitianAccountId: ownerAccountId },
        })
      ).count,
    );
    await touch(
      (
        await this.prisma.tag.updateMany({
          where: { organizationId, dietitianAccountId: null },
          data: { dietitianAccountId: ownerAccountId },
        })
      ).count,
    );
    await touch(
      (
        await this.prisma.recipe.updateMany({
          where: { organizationId, dietitianAccountId: null },
          data: { dietitianAccountId: ownerAccountId },
        })
      ).count,
    );
    await touch(
      (
        await this.prisma.recipeIngredient.updateMany({
          where: { organizationId, dietitianAccountId: null },
          data: { dietitianAccountId: ownerAccountId },
        })
      ).count,
    );
    await touch(
      (
        await this.prisma.foodOverride.updateMany({
          where: { organizationId, dietitianAccountId: null },
          data: { dietitianAccountId: ownerAccountId },
        })
      ).count,
    );
    await touch(
      (
        await this.prisma.automationRule.updateMany({
          where: { organizationId, dietitianAccountId: null },
          data: { dietitianAccountId: ownerAccountId },
        })
      ).count,
    );
    await touch(
      (
        await this.prisma.automationRun.updateMany({
          where: { organizationId, dietitianAccountId: null },
          data: { dietitianAccountId: ownerAccountId },
        })
      ).count,
    );
    await touch(
      (
        await this.prisma.assessmentTemplate.updateMany({
          where: { organizationId, dietitianAccountId: null },
          data: { dietitianAccountId: ownerAccountId },
        })
      ).count,
    );
    await touch(
      (
        await this.prisma.auditLog.updateMany({
          where: { organizationId, dietitianAccountId: null },
          data: { dietitianAccountId: ownerAccountId },
        })
      ).count,
    );

    const sequencesCopied = await this.prisma.$executeRaw`
      INSERT INTO invoice_sequences (dietitian_account_id, organization_id, next_number, updated_at)
      SELECT ${ownerAccountId}::uuid, organization_id, next_number, updated_at
      FROM invoice_sequences_legacy
      WHERE organization_id = ${organizationId}::uuid
      ON CONFLICT (dietitian_account_id) DO NOTHING
    `;

    const aiUsageCopied = await this.prisma.$executeRaw`
      INSERT INTO ai_usage (dietitian_account_id, organization_id, period_key, request_count, updated_at)
      SELECT ${ownerAccountId}::uuid, organization_id, period_key, request_count, updated_at
      FROM ai_usage_legacy
      WHERE organization_id = ${organizationId}::uuid
      ON CONFLICT (dietitian_account_id, period_key) DO NOTHING
    `;

    const automationUsageCopied = await this.prisma.$executeRaw`
      INSERT INTO automation_usage (dietitian_account_id, organization_id, period_key, execution_count, updated_at)
      SELECT ${ownerAccountId}::uuid, organization_id, period_key, execution_count, updated_at
      FROM automation_usage_legacy
      WHERE organization_id = ${organizationId}::uuid
      ON CONFLICT (dietitian_account_id, period_key) DO NOTHING
    `;

    return {
      orgAssetsUpdated,
      sequencesCopied: Number(sequencesCopied),
      aiUsageCopied: Number(aiUsageCopied),
      automationUsageCopied: Number(automationUsageCopied),
    };
  }

  private async remapAssignees(): Promise<{
    appointmentsRemapped: number;
    tasksRemapped: number;
  }> {
    const appointmentsRemapped = await this.prisma.$executeRaw`
      UPDATE appointments a
      SET assigned_user_id = m.user_id
      FROM organization_members m
      WHERE a.assigned_member_id = m.id
        AND a.assigned_user_id IS NULL
        AND a.assigned_member_id IS NOT NULL
    `;

    const tasksRemapped = await this.prisma.$executeRaw`
      UPDATE tasks t
      SET assigned_user_id = m.user_id
      FROM organization_members m
      WHERE t.assigned_member_id = m.id
        AND t.assigned_user_id IS NULL
        AND t.assigned_member_id IS NOT NULL
    `;

    return {
      appointmentsRemapped: Number(appointmentsRemapped),
      tasksRemapped: Number(tasksRemapped),
    };
  }

  private async rewriteAutomationConfigs(): Promise<number> {
    const rules = await this.prisma.automationRule.findMany({
      select: { id: true, configuration: true },
    });

    let rewritten = 0;
    for (const rule of rules) {
      const config = rule.configuration as Prisma.JsonObject | null;
      if (!config || typeof config !== "object") continue;

      const recipient = config.recipient;
      const memberId = typeof config.memberId === "string" ? config.memberId : null;
      if (recipient !== "SPECIFIC_MEMBER" || !memberId) continue;

      const member = await this.prisma.organizationMember.findUnique({
        where: { id: memberId },
        select: { userId: true },
      });
      if (!member) continue;

      // Rewrite memberId from OrganizationMember.id → User.id for DietitianAccount runtime
      const next: Prisma.InputJsonObject = {
        ...config,
        memberId: member.userId,
      };

      await this.prisma.automationRule.update({
        where: { id: rule.id },
        data: { configuration: next },
      });
      rewritten += 1;
    }

    return rewritten;
  }

  private async backfillInvitations(
    accountByUserId: Map<string, string>,
  ): Promise<number> {
    const invitations = await this.prisma.invitationToken.findMany({
      where: { dietitianAccountId: null },
      select: {
        id: true,
        organizationId: true,
        createdById: true,
        clientId: true,
      },
    });

    let updated = 0;
    for (const inv of invitations) {
      let dietitianAccountId: string | null = null;

      if (inv.clientId) {
        const client = await this.prisma.client.findUnique({
          where: { id: inv.clientId },
          select: { dietitianAccountId: true },
        });
        dietitianAccountId = client?.dietitianAccountId ?? null;
      }

      if (!dietitianAccountId && inv.createdById) {
        dietitianAccountId = accountByUserId.get(inv.createdById) ?? null;
        if (!dietitianAccountId) {
          const account = await this.prisma.dietitianAccount.findUnique({
            where: { userId: inv.createdById },
            select: { id: true },
          });
          dietitianAccountId = account?.id ?? null;
        }
      }

      if (!dietitianAccountId && inv.organizationId) {
        // OWNER account id equals org id when created
        const ownerAccount = await this.prisma.dietitianAccount.findUnique({
          where: { id: inv.organizationId },
          select: { id: true },
        });
        dietitianAccountId = ownerAccount?.id ?? null;
      }

      if (!dietitianAccountId) continue;

      await this.prisma.invitationToken.update({
        where: { id: inv.id },
        data: { dietitianAccountId },
      });
      updated += 1;
    }

    return updated;
  }
}
