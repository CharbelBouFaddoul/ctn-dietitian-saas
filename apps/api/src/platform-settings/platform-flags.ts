import type { PrismaClient } from "@prisma/client";
import {
  DEFAULT_PLATFORM_SETTINGS,
  PLATFORM_SETTINGS_SINGLETON_ID,
} from "./platform-settings.defaults";

export type PlatformFlags = {
  emailVerificationRequired: boolean;
  onlineCheckoutEnabled: boolean;
  trialSignupEnabled: boolean;
  trialDurationDays: number;
  trialPlanSlug: string;
};

export async function loadPlatformFlags(
  prisma: Pick<PrismaClient, "platformSettings">,
): Promise<PlatformFlags> {
  const row = await prisma.platformSettings.findUnique({
    where: { id: PLATFORM_SETTINGS_SINGLETON_ID },
    select: {
      emailVerificationRequired: true,
      onlineCheckoutEnabled: true,
      trialSignupEnabled: true,
      trialDurationDays: true,
      trialPlanSlug: true,
    },
  });
  return {
    emailVerificationRequired:
      row?.emailVerificationRequired ?? DEFAULT_PLATFORM_SETTINGS.emailVerificationRequired,
    onlineCheckoutEnabled: row?.onlineCheckoutEnabled ?? DEFAULT_PLATFORM_SETTINGS.onlineCheckoutEnabled,
    trialSignupEnabled: row?.trialSignupEnabled ?? DEFAULT_PLATFORM_SETTINGS.trialSignupEnabled,
    trialDurationDays: row?.trialDurationDays ?? DEFAULT_PLATFORM_SETTINGS.trialDurationDays,
    trialPlanSlug: row?.trialPlanSlug?.trim() || DEFAULT_PLATFORM_SETTINGS.trialPlanSlug,
  };
}
