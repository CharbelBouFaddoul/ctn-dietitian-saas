import { Injectable } from "@nestjs/common";
import type { ConsentType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ConsentService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: {
    userId: string;
    type: ConsentType;
    policyVersion: string;
    ipAddress?: string;
  }) {
    return this.prisma.consent.create({
      data: {
        userId: input.userId,
        type: input.type,
        policyVersion: input.policyVersion,
        acceptedAt: new Date(),
        ipAddress: input.ipAddress,
      },
    });
  }
}
