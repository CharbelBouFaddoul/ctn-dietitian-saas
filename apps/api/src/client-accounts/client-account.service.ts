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
import type { TenantContext } from "../organizations/tenant.types";
import { TimelineService } from "../timeline/timeline.service";
import { ClientAccessService } from "../clients/client-access.service";
import {
  CLIENT_ACCOUNT_EXISTS,
  CLIENT_LIMIT_REACHED,
  JOIN_ALREADY_CONNECTED,
  JOIN_CODE_EXPIRED,
  JOIN_CODE_INVALID,
  JOIN_CODE_USED,
  JOIN_NOT_ALLOWED,
} from "../clients/client.messages";
import { deriveConnectionStatus } from "../clients/portal-connection";

@Injectable()
export class ClientAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClientAccessService,
    private readonly entitlements: EntitlementService,
    private readonly invitations: InvitationService,
    private readonly tokens: TokenService,
    private readonly sessions: SessionService,
    private readonly timeline: TimelineService,
    private readonly security: SecurityEventLogger,
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
      targetType: "client_account",
      targetId: account.id,
    });
    return this.connectionFor(clientId);
  }

  async onboarding(userId: string) {
    await this.assertCanUsePortalOnboarding(userId);
    const account = await this.prisma.clientAccount.findUnique({
      where: { userId },
      include: {
        client: { include: { organization: { include: { settings: true } } } },
      },
    });
    if (account?.status === "ACTIVE") {
      return {
        status: "connected" as const,
        practiceName: this.practiceName(account.client.organization),
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
    if (!invitation || invitation.purpose !== "CLIENT_INVITE" || !invitation.organizationId) {
      throw new BadRequestException(JOIN_CODE_INVALID);
    }
    if (invitation.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException(JOIN_CODE_EXPIRED);
    }

    if (!invitation.clientId) {
      return this.joinPractice(userId, invitation.organizationId, invitation.createdById, input);
    }

    if (invitation.usedAt) {
      throw new BadRequestException(JOIN_CODE_USED);
    }

    return this.joinExistingClient(userId, invitation.clientId, invitation.organizationId, normalized);
  }

  async portalMe(userId: string) {
    const client = await this.access.assertPortalAccess(userId);
    return {
      client: {
        id: client.id,
        organizationId: client.organizationId,
        firstName: client.firstName,
        lastName: client.lastName,
        displayName: client.displayName,
        status: client.status,
      },
    };
  }

  private async joinPractice(
    userId: string,
    organizationId: string,
    createdById: string | null,
    input: { firstName?: string; lastName?: string },
  ) {
    const userAccount = await this.prisma.clientAccount.findUnique({ where: { userId } });
    if (userAccount?.status === "ACTIVE") {
      throw new ConflictException(JOIN_ALREADY_CONNECTED);
    }
    if (userAccount && userAccount.organizationId !== organizationId) {
      throw new ConflictException(JOIN_ALREADY_CONNECTED);
    }

    if (userAccount) {
      return this.activateExistingAccount(userId, userAccount.clientId, organizationId, userAccount.id);
    }

    await this.assertClientLimit(organizationId);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const { firstName, lastName } = this.resolveJoinNames(user, input);
    const assignedMember = createdById
      ? await this.prisma.organizationMember.findFirst({
          where: {
            organizationId,
            userId: createdById,
            status: "ACTIVE",
            role: { in: ["OWNER", "DIETITIAN"] },
          },
        })
      : null;

    const { account, clientId } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.client.create({
        data: {
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
        data: { organizationId, clientId: created.id },
      });
      if (assignedMember) {
        await tx.clientAssignment.create({
          data: {
            organizationId,
            clientId: created.id,
            organizationMemberId: assignedMember.id,
            assignedById: createdById,
          },
        });
      }
      const saved = await tx.clientAccount.create({
        data: {
          userId,
          clientId: created.id,
          organizationId,
          status: "ACTIVE",
          activatedAt: new Date(),
        },
      });
      return { account: saved, clientId: created.id };
    });

    await this.timeline.record({
      organizationId,
      clientId,
      type: "CLIENT_CREATED",
      actorUserId: userId,
      targetType: "client",
      targetId: clientId,
      metadata: { status: "ACTIVE", source: "practice_join" },
    });
    if (assignedMember) {
      await this.timeline.record({
        organizationId,
        clientId,
        type: "CLIENT_ASSIGNED",
        actorUserId: userId,
        targetType: "assignment",
        metadata: { organizationMemberId: assignedMember.id },
      });
    }
    await this.timeline.record({
      organizationId,
      clientId,
      type: "CLIENT_ACCOUNT_CREATED",
      actorUserId: userId,
      targetType: "client_account",
      targetId: account.id,
    });
    await this.timeline.record({
      organizationId,
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
      organizationId,
      targetType: "client_account",
      targetId: account.id,
      metadata: { clientId, source: "practice_join" },
    });

    return this.connectedResult(organizationId, clientId);
  }

  private async joinExistingClient(
    userId: string,
    clientId: string,
    organizationId: string,
    normalizedCode: string,
  ) {
    const userAccount = await this.prisma.clientAccount.findUnique({ where: { userId } });
    const clientAccount = await this.prisma.clientAccount.findUnique({ where: { clientId } });

    if (userAccount && userAccount.clientId !== clientId) {
      throw new ConflictException(JOIN_ALREADY_CONNECTED);
    }
    if (clientAccount && clientAccount.userId !== userId) {
      throw new ConflictException(CLIENT_ACCOUNT_EXISTS);
    }
    if (userAccount?.status === "ACTIVE") {
      throw new ConflictException(JOIN_ALREADY_CONNECTED);
    }

    const existing = userAccount ?? clientAccount;
    const account = await this.prisma.$transaction(async (tx) => {
      const saved = existing
        ? await tx.clientAccount.update({
            where: { id: existing.id },
            data: {
              status: "ACTIVE",
              activatedAt: new Date(),
              deactivatedAt: null,
            },
          })
        : await tx.clientAccount.create({
            data: {
              userId,
              clientId,
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
        organizationId,
        clientId,
        type: "CLIENT_ACCOUNT_CREATED",
        actorUserId: userId,
        targetType: "client_account",
        targetId: account.id,
      });
    }
    await this.timeline.record({
      organizationId,
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
      organizationId,
      targetType: "client_account",
      targetId: account.id,
      metadata: { clientId },
    });

    return this.connectedResult(organizationId, clientId);
  }

  private async activateExistingAccount(
    userId: string,
    clientId: string,
    organizationId: string,
    accountId: string,
  ) {
    await this.prisma.clientAccount.update({
      where: { id: accountId },
      data: {
        status: "ACTIVE",
        activatedAt: new Date(),
        deactivatedAt: null,
      },
    });
    await this.timeline.record({
      organizationId,
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
      organizationId,
      targetType: "client_account",
      targetId: accountId,
      metadata: { clientId },
    });
    return this.connectedResult(organizationId, clientId);
  }

  private async connectedResult(organizationId: string, clientId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: { settings: true },
    });
    return {
      status: "connected" as const,
      practiceName: organization ? this.practiceName(organization) : null,
      clientId,
    };
  }

  private async assertCanUsePortalOnboarding(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user?.platformRole) {
      throw new ForbiddenException(JOIN_NOT_ALLOWED);
    }
    const membership = await this.prisma.organizationMember.findFirst({
      where: { userId, status: "ACTIVE" },
    });
    if (membership) {
      throw new ForbiddenException(JOIN_NOT_ALLOWED);
    }
  }

  private async assertClientLimit(organizationId: string): Promise<void> {
    const entitlement = await this.entitlements.resolve(organizationId, FEATURE_KEYS.CLIENT_LIMIT);
    if (!entitlement.enabled) {
      throw new ForbiddenException(CLIENT_LIMIT_REACHED);
    }
    if (entitlement.limit === null) {
      return;
    }
    const count = await this.prisma.client.count({
      where: { organizationId, status: { in: ["PENDING", "ACTIVE"] } },
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

  private practiceName(organization: {
    name: string;
    settings: { practiceName: string | null } | null;
  }): string {
    return organization.settings?.practiceName?.trim() || organization.name;
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
            organizationId: tenant.organizationId,
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
