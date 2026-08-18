import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { InvitationPurpose, InvitationToken } from "@prisma/client";
import type { AppEnv } from "@nutrition-saas/validation";
import { PrismaService } from "../prisma/prisma.service";
import { AUTH_MESSAGES } from "./auth.messages";
import { TokenService } from "./token.service";

export class InvalidInvitationTokenError extends Error {
  constructor() {
    super(AUTH_MESSAGES.invalidInvitationToken);
    this.name = "InvalidInvitationTokenError";
  }
}

export interface CreateInvitationInput {
  purpose: InvitationPurpose;
  emailNormalized?: string;
  createdById?: string;
  ttlSeconds?: number;
  clientId?: string;
  organizationId?: string;
}

@Injectable()
export class InvitationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  async create(input: CreateInvitationInput): Promise<{ rawToken: string; invitation: InvitationToken }> {
    const { rawToken, tokenHash } = this.tokens.issue();
    const ttl = input.ttlSeconds ?? this.config.get("INVITATION_TTL_SECONDS", { infer: true }) ?? 60 * 60 * 24 * 7;
    const invitation = await this.prisma.invitationToken.create({
      data: {
        tokenHash,
        purpose: input.purpose,
        emailNormalized: input.emailNormalized,
        createdById: input.createdById,
        clientId: input.clientId,
        organizationId: input.organizationId,
        expiresAt: new Date(Date.now() + ttl * 1000),
      },
    });
    return { rawToken, invitation };
  }

  async validate(rawToken: string): Promise<InvitationToken> {
    const invitation = await this.findUsable(rawToken);
    if (!invitation) {
      throw new InvalidInvitationTokenError();
    }
    return invitation;
  }

  async consume(rawToken: string, usedById?: string): Promise<InvitationToken> {
    const invitation = await this.findUsable(rawToken);
    if (!invitation) {
      throw new InvalidInvitationTokenError();
    }

    return this.prisma.invitationToken.update({
      where: { id: invitation.id },
      data: {
        usedAt: new Date(),
        usedById: usedById ?? null,
      },
    });
  }

  private async findUsable(rawToken: string): Promise<InvitationToken | null> {
    const tokenHash = this.tokens.hashToken(rawToken);
    const invitation = await this.prisma.invitationToken.findUnique({
      where: { tokenHash },
    });

    if (!invitation || invitation.usedAt || invitation.expiresAt.getTime() <= Date.now()) {
      return null;
    }

    return invitation;
  }
}
