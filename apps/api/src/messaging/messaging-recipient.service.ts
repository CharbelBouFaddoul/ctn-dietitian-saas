import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class MessagingRecipientService {
  constructor(private readonly prisma: PrismaService) {}

  /** Phase 1: notify the dietitian account owner for this client. */
  async assignedMemberUserIds(dietitianAccountId: string, clientId: string): Promise<string[]> {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, dietitianAccountId },
      select: { dietitianAccountId: true },
    });
    if (!client?.dietitianAccountId) {
      return [];
    }
    const account = await this.prisma.dietitianAccount.findUnique({
      where: { id: client.dietitianAccountId },
      select: { userId: true, status: true },
    });
    if (!account || account.status !== "ACTIVE") {
      return [];
    }
    return [account.userId];
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
