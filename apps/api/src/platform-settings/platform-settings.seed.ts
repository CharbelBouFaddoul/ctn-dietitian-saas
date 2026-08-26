import type { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import {
  DEFAULT_PLATFORM_SETTINGS,
  PLATFORM_SETTINGS_SINGLETON_ID,
} from "./platform-settings.defaults";

export async function seedPlatformSettings(prisma: PrismaClient): Promise<void> {
  const defaults = DEFAULT_PLATFORM_SETTINGS;
  await prisma.platformSettings.upsert({
    where: { id: PLATFORM_SETTINGS_SINGLETON_ID },
    update: {
      plansPageEnabled: defaults.plansPageEnabled,
      ctaHref: defaults.ctaHref,
      navItems: defaults.navItems as unknown as Prisma.InputJsonValue,
      footerGroups: defaults.footerGroups as unknown as Prisma.InputJsonValue,
      dietitianRegistrationEnabled: defaults.dietitianRegistrationEnabled,
      patientRegistrationEnabled: defaults.patientRegistrationEnabled,
    },
    create: {
      id: PLATFORM_SETTINGS_SINGLETON_ID,
      brandText: defaults.brandText,
      logoUrl: defaults.logoUrl,
      brandDisplay: defaults.brandDisplay,
      navItems: defaults.navItems as unknown as Prisma.InputJsonValue,
      ctaText: defaults.ctaText,
      ctaHref: defaults.ctaHref,
      ctaVisible: defaults.ctaVisible,
      dietitianRegistrationEnabled: defaults.dietitianRegistrationEnabled,
      patientRegistrationEnabled: defaults.patientRegistrationEnabled,
      plansPageEnabled: defaults.plansPageEnabled,
      emailNotificationsEnabled: defaults.emailNotificationsEnabled,
      dietitianSignInLabel: defaults.dietitianSignInLabel,
      patientSignInLabel: defaults.patientSignInLabel,
      footerDescription: defaults.footerDescription,
      footerGroups: defaults.footerGroups as unknown as Prisma.InputJsonValue,
      copyrightText: defaults.copyrightText,
      socialLinks: defaults.socialLinks as unknown as Prisma.InputJsonValue,
      contactEmail: defaults.contactEmail,
      contactPhone: defaults.contactPhone,
      contactAddress: defaults.contactAddress,
      contactHours: defaults.contactHours,
    },
  });
}
