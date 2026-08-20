import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { FEATURE_KEYS } from "@nutrition-saas/config";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SecurityEventLogger } from "../auth/security-event.logger";
import { InvitationService } from "../auth/invitation.service";
import { TokenService } from "../auth/token.service";
import { SessionService } from "../auth/session.service";
import { EntitlementService } from "../entitlements/entitlement.service";
import { SubscriptionLifecycleService } from "../entitlements/subscription-lifecycle.service";
import type { TenantContext } from "../organizations/tenant.types";
import { legacyOrganizationId, tenantWhere } from "../organizations/tenant-scope";
import { TimelineService } from "../timeline/timeline.service";
import { ClientAccessService } from "../clients/client-access.service";
import { NotificationService } from "../notifications/notification.service";
import {
  CLIENT_ACCOUNT_EXISTS,
  CLIENT_LIMIT_REACHED,
  JOIN_ALREADY_CONNECTED,
  JOIN_CODE_EXPIRED,
  JOIN_CODE_INVALID,
  JOIN_CODE_USED,
  JOIN_NOT_ALLOWED,
  JOIN_PRACTICE_LOCKED,
} from "../clients/client.messages";
import { deriveConnectionStatus } from "../clients/portal-connection";

@Injectable()
export class ClientAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClientAccessService,
    private readonly entitlements: EntitlementService,
    private readonly lifecycle: SubscriptionLifecycleService,
    private readonly invitations: InvitationService,
    private readonly tokens: TokenService,
    private readonly sessions: SessionService,
    private readonly timeline: TimelineService,
    private readonly security: SecurityEventLogger,
    private readonly notifications: NotificationService,
  ) {}

  async get(tenant: TenantContext, clientId: string) {
    await this.access.assertCanAccess(tenant, clientId, "read");
    return this.connectionFor(clientId);
  }

  async getPracticeJoinCode(tenant: TenantContext) {
    this.access.assertCanCreate(tenant);
    const open = await this.invitations.findOpenPracticeInvite(tenant.organizationId);
    if (!open) {
      return { status: "none" as const, expiresAt: null, hint: null, code: null };
    }
    const expired = open.expiresAt.getTime() <= Date.now();
    return {
      status: expired ? ("expired" as const) : ("active" as const),
      expiresAt: open.expiresAt.toISOString(),
      hint: open.emailNormalized,
      code: null,
    };
  }

  async generatePracticeJoinCode(tenant: TenantContext) {
    this.access.assertCanCreate(tenant);
    await this.invitations.deleteUnusedPracticeInvites(tenant.organizationId);
    const issued = await this.issueJoinCode(tenant);
    await this.security.record({
      type: "join_code_generated",
      outcome: "success",
      userId: tenant.userId,
      organizationId: tenant.organizationId,
      dietitianAccountId: tenant.organizationId,
      targetType: "organization",
      targetId: tenant.organizationId,
    });
    return { ...issued, status: "active" as const };
  }

  async revokePracticeJoinCode(tenant: TenantContext) {
    this.access.assertCanCreate(tenant);
    const open = await this.invitations.findOpenPracticeInvite(tenant.organizationId);
    if (!open) {
      throw new NotFoundException("No unused join code to revoke");
    }
    await this.invitations.deleteUnusedPracticeInvites(tenant.organizationId);
    await this.security.record({
      type: "join_code_revoked",
      outcome: "success",
      userId: tenant.userId,
      organizationId: tenant.organizationId,
      dietitianAccountId: tenant.organizationId,
      targetType: "organization",
      targetId: tenant.organizationId,
    });
    return { status: "none" as const, expiresAt: null, hint: null, code: null };
  }

  async generateJoinCode(tenant: TenantContext, clientId: string) {
    await this.access.assertCanAccess(tenant, clientId, "invite");
    const account = await this.prisma.clientAccount.findUnique({ where: { clientId } });
    if (account?.status === "ACTIVE") {
      throw new ConflictException(CLIENT_ACCOUNT_EXISTS);
    }

    await this.invitations.deleteUnusedClientInvites(clientId);
    const issued = await this.issueJoinCode(tenant, clientId);
    await this.security.record({
      type: "join_code_generated",
      outcome: "success",
      userId: tenant.userId,
      organizationId: tenant.organizationId,
      dietitianAccountId: tenant.organizationId,
      targetType: "client",
      targetId: clientId,
    });
    return issued;
  }

  async revokeJoinCode(tenant: TenantContext, clientId: string) {
    await this.access.assertCanAccess(tenant, clientId, "invite");
    const open = await this.invitations.findOpenClientInvite(clientId);
    if (!open) {
      throw new NotFoundException("No unused join code to revoke");
    }
    await this.invitations.deleteUnusedClientInvites(clientId);
    await this.security.record({
      type: "join_code_revoked",
      outcome: "success",
      userId: tenant.userId,
      organizationId: tenant.organizationId,
      dietitianAccountId: tenant.organizationId,
      targetType: "client",
      targetId: clientId,
    });
    return this.connectionFor(clientId);
  }

  async deactivate(tenant: TenantContext, clientId: string) {
    await this.access.assertCanAccess(tenant, clientId, "invite");
    const account = await this.prisma.clientAccount.findUnique({ where: { clientId } });
    if (!account) {
      throw new NotFoundException("Portal account not found");
    }
    await this.prisma.clientAccount.update({
      where: { id: account.id },
      data: { status: "DEACTIVATED", deactivatedAt: new Date() },
    });
    await this.sessions.revokeAllForUser(account.userId);
    await this.timeline.record({
      organizationId: tenant.organizationId,
      legacyOrganizationId: legacyOrganizationId(tenant),
      clientId,
      type: "CLIENT_ACCOUNT_DEACTIVATED",
      actorUserId: tenant.userId,
      targetType: "client_account",
      targetId: account.id,
    });
    await this.security.record({
      type: "client_account_deactivated",
      outcome: "success",
      userId: tenant.userId,
      organizationId: tenant.organizationId,
      dietitianAccountId: tenant.organizationId,
      targetType: "client_account",
      targetId: account.id,
    });
    return this.connectionFor(clientId);
  }

  async onboarding(userId: string) {
    await this.assertCanUsePortalOnboarding(userId);
    const account = await this.prisma.clientAccount.findFirst({
      where: { userId, status: "ACTIVE" },
      include: {
        client: true,
        dietitianAccount: { include: { settings: true } },
      },
      orderBy: { activatedAt: "asc" },
    });
    if (account?.status === "ACTIVE") {
      return {
        status: "connected" as const,
        practiceName: await this.practiceNameForAccount(
          account.dietitianAccountId ?? account.organizationId,
          account.dietitianAccount,
        ),
      };
    }
    return { status: "needs_join" as const, practiceName: null };
  }

  async join(userId: string, input: { code: string; firstName?: string; lastName?: string }) {
    await this.assertCanUsePortalOnboarding(userId);

    const normalized = this.tokens.normalizeJoinCode(input.code);
    if (normalized.length !== 8) {
      throw new BadRequestException(JOIN_CODE_INVALID);
    }

    const invitation = await this.invitations.inspect(normalized);
    const dietitianAccountId = invitation?.dietitianAccountId ?? invitation?.organizationId ?? null;
    if (!invitation || invitation.purpose !== "CLIENT_INVITE" || !dietitianAccountId) {
      throw new BadRequestException(JOIN_CODE_INVALID);
    }
    if (invitation.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException(JOIN_CODE_EXPIRED);
    }

    const access = await this.lifecycle.getAccessForAccount(dietitianAccountId);
    if (access.accessState === "LOCKED") {
      throw new ForbiddenException(JOIN_PRACTICE_LOCKED);
    }

    if (!invitation.clientId) {
      return this.joinPractice(userId, dietitianAccountId, invitation.createdById, input);
    }

    if (invitation.usedAt) {
      throw new BadRequestException(JOIN_CODE_USED);
    }

    return this.joinExistingClient(userId, invitation.clientId, dietitianAccountId, normalized);
  }

  async portalMe(userId: string, activeClientId?: string | null) {
    const client = await this.access.assertPortalAccess(userId, {
      activeClientId,
      requireSelection: false,
    });
    const account = await this.prisma.dietitianAccount.findUnique({
      where: { id: client.dietitianAccountId ?? client.organizationId },
    });
    return {
      client: {
        id: client.id,
        organizationId: client.dietitianAccountId ?? client.organizationId,
        firstName: client.firstName,
        lastName: client.lastName,
        displayName: client.displayName,
        status: client.status,
      },
      practiceName: account?.displayName ?? null,
      activeClientId: client.id,
    };
  }

  async listConnections(userId: string) {
    const dietitianAccount = await this.prisma.dietitianAccount.findUnique({ where: { userId } });
    if (dietitianAccount) {
      throw new ForbiddenException(JOIN_NOT_ALLOWED);
    }

    const accounts = await this.prisma.clientAccount.findMany({
      where: { userId, status: "ACTIVE" },
      include: {
        client: true,
        dietitianAccount: { select: { id: true, displayName: true } },
      },
      orderBy: { activatedAt: "asc" },
    });

    return accounts
      .filter((row) => row.client.status === "ACTIVE")
      .map((row) => ({
        clientId: row.clientId,
        practiceName:
          row.dietitianAccount?.displayName ??
          row.client.displayName ??
          "Practice",
        dietitianAccountId: row.dietitianAccountId ?? row.organizationId,
        client: {
          id: row.client.id,
          firstName: row.client.firstName,
          lastName: row.client.lastName,
          displayName: row.client.displayName,
        },
        activatedAt: row.activatedAt?.toISOString() ?? null,
      }));
  }

  async setActiveConnection(userId: string, sessionId: string, clientId: string) {
    await this.sessions.setActiveClientId(sessionId, userId, clientId);
    return this.portalMe(userId, clientId);
  }

  private async joinPractice(
    userId: string,
    dietitianAccountId: string,
    createdById: string | null,
    input: { firstName?: string; lastName?: string },
  ) {
    const userAccounts = await this.prisma.clientAccount.findMany({ where: { userId } });
    const activeSame = userAccounts.find(
      (row) =>
        row.status === "ACTIVE" &&
        (row.dietitianAccountId ?? row.organizationId) === dietitianAccountId,
    );
    if (activeSame) {
      throw new ConflictException(JOIN_ALREADY_CONNECTED);
    }
    const existingForDietitian = userAccounts.find(
      (row) => (row.dietitianAccountId ?? row.organizationId) === dietitianAccountId,
    );

    if (existingForDietitian) {
      return this.activateExistingAccount(
        userId,
        existingForDietitian.clientId,
        dietitianAccountId,
        existingForDietitian.id,
      );
    }

    await this.assertClientLimit(dietitianAccountId);
    const account = await this.prisma.dietitianAccount.findUniqueOrThrow({
      where: { id: dietitianAccountId },
    });
    const organizationId = account.legacyOrganizationId ?? account.id;
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const { firstName, lastName } = this.resolveJoinNames(user, input);

    const { portalAccount, clientId } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.client.create({
        data: {
          dietitianAccountId,
          organizationId,
          firstName,
          lastName,
          displayName: `${firstName} ${lastName}`,
          email: user.email,
          status: "ACTIVE",
          createdById,
        },
      });
      await tx.clientProfile.create({
        data: { dietitianAccountId, organizationId, clientId: created.id },
      });
      const saved = await tx.clientAccount.create({
        data: {
          userId,
          clientId: created.id,
          dietitianAccountId,
          organizationId,
          status: "ACTIVE",
          activatedAt: new Date(),
        },
      });
      return { portalAccount: saved, clientId: created.id };
    });

    await this.timeline.record({
      organizationId: dietitianAccountId,
      legacyOrganizationId: organizationId,
      clientId,
      type: "CLIENT_CREATED",
      actorUserId: userId,
      targetType: "client",
      targetId: clientId,
      metadata: { status: "ACTIVE", source: "practice_join" },
    });
    await this.timeline.record({
      organizationId: dietitianAccountId,
      legacyOrganizationId: organizationId,
      clientId,
      type: "CLIENT_ACCOUNT_CREATED",
      actorUserId: userId,
      targetType: "client_account",
      targetId: portalAccount.id,
    });
    await this.timeline.record({
      organizationId: dietitianAccountId,
      legacyOrganizationId: organizationId,
      clientId,
      type: "CLIENT_ACCOUNT_ACTIVATED",
      actorUserId: userId,
      targetType: "client_account",
      targetId: portalAccount.id,
    });
    await this.security.record({
      type: "client_joined",
      outcome: "success",
      userId,
      organizationId: dietitianAccountId,
      dietitianAccountId,
      targetType: "client_account",
      targetId: portalAccount.id,
      metadata: { clientId, source: "practice_join" },
    });
    await this.notifyDietitianClientJoined(dietitianAccountId, clientId, organizationId);

    return this.connectedResult(dietitianAccountId, clientId);
  }

  private async joinExistingClient(
    userId: string,
    clientId: string,
    dietitianAccountId: string,
    normalizedCode: string,
  ) {
    const userAccounts = await this.prisma.clientAccount.findMany({ where: { userId } });
    const userAccount = userAccounts.find(
      (row) => (row.dietitianAccountId ?? row.organizationId) === dietitianAccountId,
    );
    if (userAccount && userAccount.clientId !== clientId) {
      throw new ConflictException(JOIN_ALREADY_CONNECTED);
    }

    const clientAccount = await this.prisma.clientAccount.findUnique({ where: { clientId } });
    if (clientAccount && clientAccount.userId !== userId) {
      throw new ConflictException(CLIENT_ACCOUNT_EXISTS);
    }
    if (userAccount?.status === "ACTIVE") {
      throw new ConflictException(JOIN_ALREADY_CONNECTED);
    }

    const existing = userAccount ?? clientAccount;
    const accountRow = await this.prisma.dietitianAccount.findUniqueOrThrow({
      where: { id: dietitianAccountId },
    });
    const organizationId = accountRow.legacyOrganizationId ?? accountRow.id;

    const account = await this.prisma.$transaction(async (tx) => {
      const saved = existing
        ? await tx.clientAccount.update({
            where: { id: existing.id },
            data: {
              status: "ACTIVE",
              activatedAt: new Date(),
              deactivatedAt: null,
              dietitianAccountId,
            },
          })
        : await tx.clientAccount.create({
            data: {
              userId,
              clientId,
              dietitianAccountId,
              organizationId,
              status: "ACTIVE",
              activatedAt: new Date(),
            },
          });

      const client = await tx.client.findUniqueOrThrow({ where: { id: clientId } });
      if (client.status === "PENDING") {
        await tx.client.update({
          where: { id: clientId },
          data: { status: "ACTIVE" },
        });
      }
      return saved;
    });

    await this.invitations.consume(normalizedCode, userId);
    if (!existing) {
      await this.timeline.record({
        organizationId: dietitianAccountId,
        legacyOrganizationId: organizationId,
        clientId,
        type: "CLIENT_ACCOUNT_CREATED",
        actorUserId: userId,
        targetType: "client_account",
        targetId: account.id,
      });
    }
    await this.timeline.record({
      organizationId: dietitianAccountId,
      legacyOrganizationId: organizationId,
      clientId,
      type: "CLIENT_ACCOUNT_ACTIVATED",
      actorUserId: userId,
      targetType: "client_account",
      targetId: account.id,
    });
    await this.security.record({
      type: "client_joined",
      outcome: "success",
      userId,
      organizationId: dietitianAccountId,
      dietitianAccountId,
      targetType: "client_account",
      targetId: account.id,
      metadata: { clientId },
    });
    await this.notifyDietitianClientJoined(dietitianAccountId, clientId, organizationId);

    return this.connectedResult(dietitianAccountId, clientId);
  }

  private async activateExistingAccount(
    userId: string,
    clientId: string,
    dietitianAccountId: string,
    accountId: string,
  ) {
    const accountRow = await this.prisma.dietitianAccount.findUniqueOrThrow({
      where: { id: dietitianAccountId },
    });
    await this.prisma.clientAccount.update({
      where: { id: accountId },
      data: {
        status: "ACTIVE",
        activatedAt: new Date(),
        deactivatedAt: null,
        dietitianAccountId,
      },
    });
    await this.timeline.record({
      organizationId: dietitianAccountId,
      legacyOrganizationId: accountRow.legacyOrganizationId ?? accountRow.id,
      clientId,
      type: "CLIENT_ACCOUNT_ACTIVATED",
      actorUserId: userId,
      targetType: "client_account",
      targetId: accountId,
    });
    await this.security.record({
      type: "client_joined",
      outcome: "success",
      userId,
      organizationId: dietitianAccountId,
      dietitianAccountId,
      targetType: "client_account",
      targetId: accountId,
      metadata: { clientId },
    });
    await this.notifyDietitianClientJoined(
      dietitianAccountId,
      clientId,
      accountRow.legacyOrganizationId ?? accountRow.id,
    );
    return this.connectedResult(dietitianAccountId, clientId);
  }

  private async notifyDietitianClientJoined(
    dietitianAccountId: string,
    clientId: string,
    legacyOrganizationId: string,
  ) {
    const account = await this.prisma.dietitianAccount.findUnique({
      where: { id: dietitianAccountId },
      select: { userId: true },
    });
    if (!account) return;
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { displayName: true, firstName: true, lastName: true },
    });
    const name =
      client?.displayName?.trim() ||
      `${client?.firstName ?? ""} ${client?.lastName ?? ""}`.trim() ||
      "A patient";
    await this.notifications.create({
      organizationId: dietitianAccountId,
      legacyOrganizationId,
      userId: account.userId,
      clientId,
      type: "CLIENT_JOINED",
      title: "Patient joined your practice",
      body: `${name} connected to your practice.`,
      targetType: "client",
      targetId: clientId,
    });
  }

  private async connectedResult(dietitianAccountId: string, clientId: string) {
    return {
      status: "connected" as const,
      practiceName: await this.practiceNameForAccount(dietitianAccountId),
      clientId,
    };
  }

  private async assertCanUsePortalOnboarding(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user?.platformRole) {
      throw new ForbiddenException(JOIN_NOT_ALLOWED);
    }
    const dietitianAccount = await this.prisma.dietitianAccount.findUnique({
      where: { userId },
    });
    if (dietitianAccount) {
      throw new ForbiddenException(JOIN_NOT_ALLOWED);
    }
  }

  private async assertClientLimit(dietitianAccountId: string): Promise<void> {
    const entitlement = await this.entitlements.resolve(dietitianAccountId, FEATURE_KEYS.CLIENT_LIMIT);
    if (!entitlement.enabled) {
      throw new ForbiddenException(CLIENT_LIMIT_REACHED);
    }
    if (entitlement.limit === null) {
      return;
    }
    const count = await this.prisma.client.count({
      where: { ...tenantWhere(dietitianAccountId), status: { in: ["PENDING", "ACTIVE"] } },
    });
    if (count >= entitlement.limit) {
      throw new ForbiddenException(CLIENT_LIMIT_REACHED);
    }
  }

  private resolveJoinNames(
    user: { email: string; firstName: string | null; lastName: string | null },
    input: { firstName?: string; lastName?: string },
  ): { firstName: string; lastName: string } {
    const firstName = this.optionalName(input.firstName) || this.optionalName(user.firstName) || this.nameFromEmail(user.email);
    const lastName = this.optionalName(input.lastName) || this.optionalName(user.lastName) || "Client";
    return { firstName, lastName };
  }

  private optionalName(value: string | null | undefined): string | null {
    const trimmed = value?.trim() ?? "";
    return trimmed ? trimmed.slice(0, 80) : null;
  }

  private nameFromEmail(email: string): string {
    const local = email.split("@")[0] ?? "Client";
    const token = local.split(/[._+-]/).find((part) => part.length > 0) ?? "Client";
    return `${token.charAt(0).toUpperCase()}${token.slice(1)}`.slice(0, 80);
  }

  private async practiceNameForAccount(
    dietitianAccountId: string,
    preloaded?: {
      displayName: string;
      settings: { practiceName: string | null } | null;
    } | null,
  ): Promise<string | null> {
    const account =
      preloaded ??
      (await this.prisma.dietitianAccount.findUnique({
        where: { id: dietitianAccountId },
        include: { settings: true },
      }));
    if (!account) {
      return null;
    }
    return account.settings?.practiceName?.trim() || account.displayName;
  }

  private async connectionFor(clientId: string) {
    const account = await this.prisma.clientAccount.findUnique({
      where: { clientId },
      include: { user: true },
    });
    const openInvite = await this.invitations.findOpenClientInvite(clientId);
    const connectionStatus = deriveConnectionStatus(account, openInvite);
    return {
      id: account?.id ?? null,
      status: account?.status ?? null,
      email: account?.user.email ?? null,
      activatedAt: account?.activatedAt?.toISOString() ?? null,
      deactivatedAt: account?.deactivatedAt?.toISOString() ?? null,
      portalStatus: account?.status ?? null,
      connectionStatus,
      joinCode: openInvite
        ? {
            expiresAt: openInvite.expiresAt.toISOString(),
            hint: openInvite.emailNormalized,
            status: connectionStatus === "expired" ? "expired" : "waiting",
          }
        : null,
    };
  }

  private async issueJoinCode(tenant: TenantContext, clientId?: string) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const { display, normalized } = this.tokens.generateJoinCode();
      try {
        const invitation = await this.invitations.createHashed(
          {
            purpose: "CLIENT_INVITE",
            emailNormalized: normalized.slice(-4),
            createdById: tenant.userId,
            clientId,
            organizationId: legacyOrganizationId(tenant),
            dietitianAccountId: tenant.organizationId,
          },
          this.tokens.hashToken(normalized),
        );
        return {
          code: display,
          expiresAt: invitation.expiresAt.toISOString(),
          hint: normalized.slice(-4),
          status: (clientId ? "waiting" : "active") as "waiting" | "active",
          connectionStatus: clientId ? ("waiting" as const) : undefined,
        };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException("Could not generate a unique join code");
  }
}
