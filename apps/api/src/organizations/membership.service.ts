import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { MULTI_MEMBER_UNSUPPORTED } from "./organization.service";

/**
 * Phase 1: multi-member practices are not part of the runtime model.
 * List returns the dietitian account owner as a synthetic OWNER row.
 */
@Injectable()
export class MembershipService {
  constructor(private readonly prisma: PrismaService) {}

  async list(dietitianAccountId: string) {
    const account = await this.prisma.dietitianAccount.findUnique({
      where: { id: dietitianAccountId },
      include: { user: true },
    });
    if (!account) {
      return [];
    }
    return [
      {
        id: account.id,
        userId: account.userId,
        email: account.user.email,
        role: "OWNER" as const,
        status: "ACTIVE" as const,
        joinedAt: account.createdAt.toISOString(),
        deactivatedAt: null,
      },
    ];
  }

  async add(..._args: unknown[]): Promise<never> {
    throw new BadRequestException(MULTI_MEMBER_UNSUPPORTED);
  }

  async changeRole(..._args: unknown[]): Promise<never> {
    throw new BadRequestException(MULTI_MEMBER_UNSUPPORTED);
  }

  async deactivate(..._args: unknown[]): Promise<never> {
    throw new BadRequestException(MULTI_MEMBER_UNSUPPORTED);
  }

  async transferOwnership(..._args: unknown[]): Promise<never> {
    throw new BadRequestException(MULTI_MEMBER_UNSUPPORTED);
  }
}
