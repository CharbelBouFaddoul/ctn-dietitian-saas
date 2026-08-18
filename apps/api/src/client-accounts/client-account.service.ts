import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { normalizeEmail } from "@nutrition-saas/utilities";
import { PrismaService } from "../prisma/prisma.service";
import { SecurityEventLogger } from "../auth/security-event.logger";
import { InvitationService, InvalidInvitationTokenError } from "../auth/invitation.service";
import { PasswordService } from "../auth/password.service";
import { SessionService } from "../auth/session.service";
import { EmailService } from "../email/email.service";
import type { TenantContext } from "../organizations/tenant.types";
import { TimelineService } from "../timeline/timeline.service";
import { ClientAccessService } from "../clients/client-access.service";
import { CLIENT_ACCOUNT_EXISTS, CLIENT_EMAIL_IN_USE } from "../clients/client.messages";
import { AUTH_MESSAGES } from "../auth/auth.messages";

@Injectable()
export class ClientAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClientAccessService,
    private readonly invitations: InvitationService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly email: EmailService,
    private readonly timeline: TimelineService,
    private readonly security: SecurityEventLogger,
  ) {}

  async get(tenant: TenantContext, clientId: string) {
    await this.access.assertCanAccess(tenant, clientId, "read");
    const account = await this.prisma.clientAccount.findUnique({
      where: { clientId },
      include: { user: true },
    });
    if (!account) {
      return null;
    }
    return {
      id: account.id,
      status: account.status,
      email: account.user.email,
      activatedAt: account.activatedAt?.toISOString() ?? null,
      deactivatedAt: account.deactivatedAt?.toISOString() ?? null,
    };
  }

  async invite(tenant: TenantContext, clientId: string) {
    const client = await this.access.assertCanAccess(tenant, clientId, "invite");
    if (!client.email) {
      throw new BadRequestException("Client email is required to create a portal account");
    }
    const emailNormalized = normalizeEmail(client.email);

    const existingAccount = await this.prisma.clientAccount.findUnique({ where: { clientId } });
    if (existingAccount?.status === "ACTIVE") {
      throw new ConflictException(CLIENT_ACCOUNT_EXISTS);
    }

    const existingUser = await this.prisma.user.findUnique({ where: { emailNormalized } });
    if (existingUser) {
      const membership = await this.prisma.organizationMember.findFirst({
        where: { userId: existingUser.id },
      });
      if (membership) {
        throw new ConflictException(CLIENT_EMAIL_IN_USE);
      }
      const otherAccount = await this.prisma.clientAccount.findUnique({
        where: { userId: existingUser.id },
      });
      if (otherAccount && otherAccount.clientId !== clientId) {
        throw new ConflictException(CLIENT_EMAIL_IN_USE);
      }
    }

    const user =
      existingUser ??
      (await this.prisma.user.create({
        data: {
          email: client.email.trim(),
          emailNormalized,
          passwordHash: await this.passwords.hash(randomBytes(32).toString("hex")),
          status: "PENDING",
        },
      }));

    const account =
      existingAccount ??
      (await this.prisma.clientAccount.create({
        data: {
          userId: user.id,
          clientId,
          organizationId: tenant.organizationId,
          status: "PENDING",
        },
      }));

    const { rawToken } = await this.invitations.create({
      purpose: "CLIENT_INVITE",
      emailNormalized,
      createdById: tenant.userId,
      clientId,
      organizationId: tenant.organizationId,
    });
    await this.email.sendInvitation(client.email, rawToken, "CLIENT_INVITE");

    await this.timeline.record({
      organizationId: tenant.organizationId,
      clientId,
      type: existingAccount ? "CLIENT_ACCOUNT_CREATED" : "CLIENT_ACCOUNT_CREATED",
      actorUserId: tenant.userId,
      targetType: "client_account",
      targetId: account.id,
    });
    await this.security.record({
      type: "client_account_invited",
      outcome: "success",
      userId: tenant.userId,
      organizationId: tenant.organizationId,
      targetType: "client_account",
      targetId: account.id,
    });

    return this.get(tenant, clientId);
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
    return this.get(tenant, clientId);
  }

  async previewInvitation(rawToken: string) {
    const invitation = await this.requireClientInvitation(rawToken);
    const client = await this.prisma.client.findUnique({ where: { id: invitation.clientId } });
    return {
      email: invitation.emailNormalized,
      clientName: client?.displayName ?? client?.firstName ?? null,
      purpose: invitation.purpose,
    };
  }

  async acceptInvitation(rawToken: string, password: string) {
    this.passwords.assertPolicy(password);
    const invitation = await this.requireClientInvitation(rawToken);

    const account = await this.prisma.clientAccount.findUnique({
      where: { clientId: invitation.clientId },
      include: { client: true, user: true },
    });
    if (!account) {
      throw new BadRequestException(AUTH_MESSAGES.invalidInvitationToken);
    }

    const membership = await this.prisma.organizationMember.findFirst({
      where: { userId: account.userId },
    });
    if (membership) {
      throw new ConflictException(CLIENT_EMAIL_IN_USE);
    }

    const passwordHash = await this.passwords.hash(password);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: account.userId },
        data: {
          passwordHash,
          status: "ACTIVE",
          emailVerifiedAt: account.user.emailVerifiedAt ?? new Date(),
        },
      });
      await tx.clientAccount.update({
        where: { id: account.id },
        data: { status: "ACTIVE", activatedAt: new Date(), deactivatedAt: null },
      });
      if (account.client.status === "PENDING") {
        await tx.client.update({
          where: { id: account.clientId },
          data: { status: "ACTIVE" },
        });
      }
    });

    await this.invitations.consume(rawToken, account.userId);
    await this.timeline.record({
      organizationId: account.organizationId,
      clientId: account.clientId,
      type: "CLIENT_ACCOUNT_ACTIVATED",
      actorUserId: account.userId,
      targetType: "client_account",
      targetId: account.id,
    });
    await this.security.record({
      type: "client_account_activated",
      outcome: "success",
      userId: account.userId,
      organizationId: account.organizationId,
      targetType: "client_account",
      targetId: account.id,
    });

    return { message: "Portal account activated. You can sign in." };
  }

  private async requireClientInvitation(rawToken: string) {
    try {
      const invitation = await this.invitations.validate(rawToken);
      if (invitation.purpose !== "CLIENT_INVITE" || !invitation.clientId) {
        throw new BadRequestException(AUTH_MESSAGES.invalidInvitationToken);
      }
      return { ...invitation, clientId: invitation.clientId };
    } catch (error) {
      if (error instanceof InvalidInvitationTokenError) {
        throw new BadRequestException(AUTH_MESSAGES.invalidInvitationToken);
      }
      throw error;
    }
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
}
