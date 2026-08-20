import { Injectable } from "@nestjs/common";
import {
  SUBSCRIPTION_GRACE_DAYS,
  SUBSCRIPTION_READ_ONLY_DAYS,
} from "@nutrition-saas/config";
import type { DietitianAccessState, SubscriptionStatus } from "@nutrition-saas/types";
import { PrismaService } from "../prisma/prisma.service";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type SubscriptionLifecycleInput = {
  status: SubscriptionStatus | string;
  currentPeriodEnd: Date | null;
  plan?: { slug: string; name: string } | null;
};

export type SubscriptionAccessSnapshot = {
  accessState: DietitianAccessState;
  status: SubscriptionStatus | null;
  planSlug: string | null;
  planName: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  graceEndsAt: Date | null;
  readOnlyEndsAt: Date | null;
  /** Whole days remaining in the current phase (ceil); null when LOCKED/ACTIVE without end. */
  daysRemainingInPhase: number | null;
};

@Injectable()
export class SubscriptionLifecycleService {
  private clock: () => Date = () => new Date();

  constructor(private readonly prisma: PrismaService) {}

  /** Test-only clock override. */
  setClock(clock: () => Date): void {
    this.clock = clock;
  }

  resetClock(): void {
    this.clock = () => new Date();
  }

  now(): Date {
    return this.clock();
  }

  derive(
    subscription: SubscriptionLifecycleInput | null | undefined,
    now: Date = this.now(),
  ): SubscriptionAccessSnapshot {
    if (!subscription) {
      return this.locked(null, null, null, null, null);
    }

    const status = subscription.status as SubscriptionStatus;
    const periodEnd = subscription.currentPeriodEnd;
    const planSlug = subscription.plan?.slug ?? null;
    const planName = subscription.plan?.name ?? null;

    if (status === "PENDING" || status === "SUSPENDED" || status === "CANCELLED") {
      return this.locked(status, planSlug, planName, null, periodEnd);
    }

    if (status !== "ACTIVE" && status !== "EXPIRED") {
      return this.locked(status, planSlug, planName, null, periodEnd);
    }

    // Open-ended ACTIVE/EXPIRED with no period end → fully operable.
    if (!periodEnd) {
      return {
        accessState: "ACTIVE",
        status,
        planSlug,
        planName,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        graceEndsAt: null,
        readOnlyEndsAt: null,
        daysRemainingInPhase: null,
      };
    }

    const graceEndsAt = new Date(periodEnd.getTime() + SUBSCRIPTION_GRACE_DAYS * MS_PER_DAY);
    const readOnlyEndsAt = new Date(
      periodEnd.getTime() + (SUBSCRIPTION_GRACE_DAYS + SUBSCRIPTION_READ_ONLY_DAYS) * MS_PER_DAY,
    );
    const t = now.getTime();

    if (t < periodEnd.getTime()) {
      return {
        accessState: "ACTIVE",
        status,
        planSlug,
        planName,
        currentPeriodStart: null,
        currentPeriodEnd: periodEnd,
        graceEndsAt,
        readOnlyEndsAt,
        daysRemainingInPhase: daysRemaining(periodEnd, now),
      };
    }

    if (t < graceEndsAt.getTime()) {
      return {
        accessState: "GRACE",
        status,
        planSlug,
        planName,
        currentPeriodStart: null,
        currentPeriodEnd: periodEnd,
        graceEndsAt,
        readOnlyEndsAt,
        daysRemainingInPhase: daysRemaining(graceEndsAt, now),
      };
    }

    if (t < readOnlyEndsAt.getTime()) {
      return {
        accessState: "READ_ONLY",
        status,
        planSlug,
        planName,
        currentPeriodStart: null,
        currentPeriodEnd: periodEnd,
        graceEndsAt,
        readOnlyEndsAt,
        daysRemainingInPhase: daysRemaining(readOnlyEndsAt, now),
      };
    }

    return this.locked(status, planSlug, planName, null, periodEnd, graceEndsAt, readOnlyEndsAt);
  }

  async getAccessForAccount(dietitianAccountId: string): Promise<SubscriptionAccessSnapshot> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { dietitianAccountId },
      include: { plan: true },
    });
    const snapshot = this.derive(
      subscription
        ? {
            status: subscription.status,
            currentPeriodEnd: subscription.currentPeriodEnd,
            plan: subscription.plan,
          }
        : null,
    );
    if (subscription) {
      snapshot.currentPeriodStart = subscription.currentPeriodStart;
      snapshot.currentPeriodEnd = subscription.currentPeriodEnd;
    }
    return snapshot;
  }

  /** True when plan entitlements (AI / automation / client limit) should resolve. */
  entitlementsActive(state: DietitianAccessState): boolean {
    return state === "ACTIVE" || state === "GRACE";
  }

  mutationsAllowed(state: DietitianAccessState): boolean {
    return state === "ACTIVE" || state === "GRACE";
  }

  readsAllowed(state: DietitianAccessState): boolean {
    return state === "ACTIVE" || state === "GRACE" || state === "READ_ONLY";
  }

  private locked(
    status: SubscriptionStatus | null,
    planSlug: string | null,
    planName: string | null,
    currentPeriodStart: Date | null,
    currentPeriodEnd: Date | null,
    graceEndsAt: Date | null = null,
    readOnlyEndsAt: Date | null = null,
  ): SubscriptionAccessSnapshot {
    return {
      accessState: "LOCKED",
      status,
      planSlug,
      planName,
      currentPeriodStart,
      currentPeriodEnd,
      graceEndsAt,
      readOnlyEndsAt,
      daysRemainingInPhase: null,
    };
  }
}

function daysRemaining(endsAt: Date, now: Date): number {
  const ms = endsAt.getTime() - now.getTime();
  if (ms <= 0) {
    return 0;
  }
  return Math.ceil(ms / MS_PER_DAY);
}
