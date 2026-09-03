import { Injectable, Logger } from "@nestjs/common";
import { loadPlatformFlags } from "../platform-settings/platform-flags";
import { PrismaService } from "../prisma/prisma.service";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * MS_PER_DAY);
}

const TRIAL_CLIENTS = [
  { firstName: "Sam", lastName: "Sample", sex: "UNSPECIFIED" as const },
  { firstName: "Jordan", lastName: "Demo", sex: "UNSPECIFIED" as const },
];

@Injectable()
export class TrialProvisioningService {
  private readonly logger = new Logger(TrialProvisioningService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Assign the configured trial plan when the account has no subscription yet. */
  async ensureTrialSubscription(dietitianAccountId: string): Promise<void> {
    const flags = await loadPlatformFlags(this.prisma);
    if (!flags.trialSignupEnabled) {
      return;
    }

    const existing = await this.prisma.subscription.findUnique({
      where: { dietitianAccountId },
    });
    if (existing) {
      return;
    }

    const plan = await this.prisma.plan.findUnique({
      where: { slug: flags.trialPlanSlug },
    });
    if (!plan || plan.status !== "ACTIVE") {
      this.logger.warn(`Trial plan '${flags.trialPlanSlug}' is missing or inactive; skipping trial assign.`);
      return;
    }

    const now = new Date();
    const periodEnd = addDays(now, flags.trialDurationDays);
    await this.prisma.subscription.create({
      data: {
        dietitianAccountId,
        planId: plan.id,
        status: "ACTIVE",
        startedAt: now,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        trialStartsAt: now,
        trialEndsAt: periodEnd,
      },
    });
  }

  /** Seed a small sample roster once per practice. Failures are recorded, not thrown. */
  async seedSampleData(dietitianAccountId: string, userId: string): Promise<void> {
    const flags = await loadPlatformFlags(this.prisma);
    if (!flags.trialSignupEnabled) {
      return;
    }

    const account = await this.prisma.dietitianAccount.findUnique({
      where: { id: dietitianAccountId },
      select: { trialSeedStatus: true },
    });
    if (!account) return;
    if (
      account.trialSeedStatus === "READY" ||
      account.trialSeedStatus === "PENDING" ||
      account.trialSeedStatus === "CLEARED"
    ) {
      return;
    }

    await this.prisma.dietitianAccount.update({
      where: { id: dietitianAccountId },
      data: { trialSeedStatus: "PENDING" },
    });

    try {
      const now = new Date();
      const createdIds: string[] = [];
      for (const sample of TRIAL_CLIENTS) {
        const client = await this.prisma.client.create({
          data: {
            dietitianAccountId,
            firstName: sample.firstName,
            lastName: sample.lastName,
            displayName: `${sample.firstName} ${sample.lastName}`,
            sex: sample.sex,
            status: "ACTIVE",
            isTrialSeed: true,
            createdById: userId,
            profile: {
              create: { dietitianAccountId },
            },
          },
        });
        createdIds.push(client.id);
      }

      const firstClientId = createdIds[0];
      if (firstClientId) {
        const startAt = addDays(now, 2);
        startAt.setHours(10, 0, 0, 0);
        const endAt = new Date(startAt.getTime() + 45 * 60 * 1000);
        await this.prisma.appointment.create({
          data: {
            dietitianAccountId,
            clientId: firstClientId,
            assignedUserId: userId,
            createdById: userId,
            title: "Sample follow-up (demo)",
            category: "CONSULTATION",
            startAt,
            endAt,
            status: "SCHEDULED",
            notes: "This is sample trial data. You can remove it from Practice settings.",
          },
        });
        await this.prisma.task.create({
          data: {
            dietitianAccountId,
            clientId: firstClientId,
            createdById: userId,
            assignedUserId: userId,
            title: "Review sample chart",
            description: "Trial sample task — delete with sample data when you are ready.",
            status: "TODO",
            priority: "NORMAL",
            dueAt: addDays(now, 3),
          },
        });
      }

      await this.prisma.dietitianAccount.update({
        where: { id: dietitianAccountId },
        data: { trialSeedStatus: "READY" },
      });
    } catch (error) {
      this.logger.error(`Trial sample seed failed for ${dietitianAccountId}`, error);
      await this.prisma.dietitianAccount.update({
        where: { id: dietitianAccountId },
        data: { trialSeedStatus: "FAILED" },
      });
    }
  }

  async removeSampleData(dietitianAccountId: string): Promise<{ archived: number }> {
    const result = await this.prisma.client.updateMany({
      where: {
        dietitianAccountId,
        isTrialSeed: true,
        status: { in: ["PENDING", "ACTIVE"] },
      },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });
    await this.prisma.dietitianAccount.update({
      where: { id: dietitianAccountId },
      data: { trialSeedStatus: "CLEARED" },
    });
    return { archived: result.count };
  }

  async getSeedStatus(dietitianAccountId: string) {
    const account = await this.prisma.dietitianAccount.findUnique({
      where: { id: dietitianAccountId },
      select: { trialSeedStatus: true },
    });
    const sampleCount = await this.prisma.client.count({
      where: {
        dietitianAccountId,
        isTrialSeed: true,
        status: { in: ["PENDING", "ACTIVE"] },
      },
    });
    return {
      trialSeedStatus: account?.trialSeedStatus ?? "NONE",
      activeSampleClients: sampleCount,
    };
  }
}
