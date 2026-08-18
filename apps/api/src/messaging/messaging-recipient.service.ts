import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class MessagingRecipientService {
  constructor(private readonly prisma: PrismaService) {}

  async assignedMemberUserIds(organizationId: string, clientId: string): Promise<string[]> {
    const assignments = await this.prisma.clientAssignment.findMany({
      where: { organizationId, clientId, unassignedAt: null },
      include: { organizationMember: { select: { userId: true, status: true } } },
    });
    return assignments
      .filter((row) => row.organizationMember.status === "ACTIVE")
      .map((row) => row.organizationMember.userId);
  }

  async clientPortalUserId(clientId: string): Promise<string | null> {
    const account = await this.prisma.clientAccount.findUnique({
      where: { clientId },
      select: { userId: true, status: true },
    });
    if (!account || account.status !== "ACTIVE") return null;
    return account.userId;
  }
}
