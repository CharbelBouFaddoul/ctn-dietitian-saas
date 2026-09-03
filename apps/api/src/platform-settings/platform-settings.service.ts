import { Injectable } from "@nestjs/common";
import type { BrandDisplayMode, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { UpdatePlatformSettingsDto } from "./dto/platform-settings.dto";
import {
  DEFAULT_PLATFORM_SETTINGS,
  PLATFORM_SETTINGS_SINGLETON_ID,
  type PlatformSettingsPayload,
  type SiteFooterGroup,
  type SiteNavItem,
  type SiteSocialLink,
} from "./platform-settings.defaults";
import { seedPlatformSettings } from "./platform-settings.seed";

@Injectable()
export class PlatformSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublic(): Promise<
    Omit<PlatformSettingsPayload, "emailNotificationsEnabled" | "trialPlanSlug">
  > {
    const row = await this.ensureSingleton();
    const full = this.toPayload(row);
    const { emailNotificationsEnabled: _email, trialPlanSlug: _trialPlan, ...publicPayload } = full;
    return publicPayload;
  }

  async getAdmin(): Promise<PlatformSettingsPayload> {
    const row = await this.ensureSingleton();
    return this.toPayload(row);
  }

  async isEmailNotificationsEnabled(): Promise<boolean> {
    const row = await this.ensureSingleton();
    return row.emailNotificationsEnabled ?? DEFAULT_PLATFORM_SETTINGS.emailNotificationsEnabled;
  }

  async update(input: UpdatePlatformSettingsDto): Promise<PlatformSettingsPayload> {
    await this.ensureSingleton();
    const data: Prisma.PlatformSettingsUpdateInput = {};
    if (input.brandText !== undefined) data.brandText = input.brandText;
    if (input.logoUrl !== undefined) data.logoUrl = input.logoUrl;
    if (input.brandDisplay !== undefined) data.brandDisplay = input.brandDisplay;
    if (input.navItems !== undefined) data.navItems = input.navItems as unknown as Prisma.InputJsonValue;
    if (input.ctaText !== undefined) data.ctaText = input.ctaText;
    if (input.ctaHref !== undefined) data.ctaHref = input.ctaHref;
    if (input.ctaVisible !== undefined) data.ctaVisible = input.ctaVisible;
    if (input.registrationEnabled !== undefined) {
      data.dietitianRegistrationEnabled = input.registrationEnabled;
      data.patientRegistrationEnabled = input.registrationEnabled;
    }
    if (input.dietitianRegistrationEnabled !== undefined) {
      data.dietitianRegistrationEnabled = input.dietitianRegistrationEnabled;
    }
    if (input.patientRegistrationEnabled !== undefined) {
      data.patientRegistrationEnabled = input.patientRegistrationEnabled;
    }
    if (input.plansPageEnabled !== undefined) data.plansPageEnabled = input.plansPageEnabled;
    if (input.emailNotificationsEnabled !== undefined) {
      data.emailNotificationsEnabled = input.emailNotificationsEnabled;
    }
    if (input.emailVerificationRequired !== undefined) {
      data.emailVerificationRequired = input.emailVerificationRequired;
    }
    if (input.onlineCheckoutEnabled !== undefined) {
      data.onlineCheckoutEnabled = input.onlineCheckoutEnabled;
    }
    if (input.trialSignupEnabled !== undefined) data.trialSignupEnabled = input.trialSignupEnabled;
    if (input.trialDurationDays !== undefined) data.trialDurationDays = input.trialDurationDays;
    if (input.trialPlanSlug !== undefined) data.trialPlanSlug = input.trialPlanSlug.trim() || "trial";
    if (input.dietitianSignInLabel !== undefined) data.dietitianSignInLabel = input.dietitianSignInLabel;
    if (input.patientSignInLabel !== undefined) data.patientSignInLabel = input.patientSignInLabel;
    if (input.footerDescription !== undefined) data.footerDescription = input.footerDescription;
    if (input.footerGroups !== undefined) {
      data.footerGroups = input.footerGroups as unknown as Prisma.InputJsonValue;
    }
    if (input.copyrightText !== undefined) data.copyrightText = input.copyrightText;
    if (input.socialLinks !== undefined) {
      data.socialLinks = input.socialLinks as unknown as Prisma.InputJsonValue;
    }
    if (input.contactEmail !== undefined) data.contactEmail = input.contactEmail;
    if (input.contactPhone !== undefined) data.contactPhone = input.contactPhone;
    if (input.contactAddress !== undefined) data.contactAddress = input.contactAddress;
    if (input.contactHours !== undefined) data.contactHours = input.contactHours;

    const row = await this.prisma.platformSettings.update({
      where: { id: PLATFORM_SETTINGS_SINGLETON_ID },
      data,
    });
    return this.toPayload(row);
  }

  private async ensureSingleton() {
    const existing = await this.prisma.platformSettings.findUnique({
      where: { id: PLATFORM_SETTINGS_SINGLETON_ID },
    });
    if (existing) return existing;
    await seedPlatformSettings(this.prisma);
    const created = await this.prisma.platformSettings.findUniqueOrThrow({
      where: { id: PLATFORM_SETTINGS_SINGLETON_ID },
    });
    return created;
  }

  private toPayload(row: {
    brandText: string;
    logoUrl: string | null;
    brandDisplay: BrandDisplayMode;
    navItems: Prisma.JsonValue;
    ctaText: string;
    ctaHref: string;
    ctaVisible: boolean;
    dietitianRegistrationEnabled: boolean;
    patientRegistrationEnabled: boolean;
    plansPageEnabled: boolean;
    emailNotificationsEnabled: boolean;
    emailVerificationRequired: boolean;
    onlineCheckoutEnabled: boolean;
    trialSignupEnabled: boolean;
    trialDurationDays: number;
    trialPlanSlug: string;
    dietitianSignInLabel: string;
    patientSignInLabel: string;
    footerDescription: string;
    footerGroups: Prisma.JsonValue;
    copyrightText: string;
    socialLinks: Prisma.JsonValue;
    contactEmail: string | null;
    contactPhone: string | null;
    contactAddress: string | null;
    contactHours: string | null;
  }): PlatformSettingsPayload {
    const dietitianRegistrationEnabled =
      row.dietitianRegistrationEnabled ?? DEFAULT_PLATFORM_SETTINGS.dietitianRegistrationEnabled;
    const patientRegistrationEnabled =
      row.patientRegistrationEnabled ?? DEFAULT_PLATFORM_SETTINGS.patientRegistrationEnabled;
    return {
      brandText: row.brandText || DEFAULT_PLATFORM_SETTINGS.brandText,
      logoUrl: row.logoUrl,
      brandDisplay: row.brandDisplay,
      navItems: this.asNavItems(row.navItems),
      ctaText: row.ctaText || DEFAULT_PLATFORM_SETTINGS.ctaText,
      ctaHref: row.ctaHref || DEFAULT_PLATFORM_SETTINGS.ctaHref,
      ctaVisible: row.ctaVisible,
      dietitianRegistrationEnabled,
      patientRegistrationEnabled,
      registrationEnabled: dietitianRegistrationEnabled || patientRegistrationEnabled,
      plansPageEnabled: row.plansPageEnabled ?? DEFAULT_PLATFORM_SETTINGS.plansPageEnabled,
      emailNotificationsEnabled:
        row.emailNotificationsEnabled ?? DEFAULT_PLATFORM_SETTINGS.emailNotificationsEnabled,
      emailVerificationRequired:
        row.emailVerificationRequired ?? DEFAULT_PLATFORM_SETTINGS.emailVerificationRequired,
      onlineCheckoutEnabled: row.onlineCheckoutEnabled ?? DEFAULT_PLATFORM_SETTINGS.onlineCheckoutEnabled,
      trialSignupEnabled: row.trialSignupEnabled ?? DEFAULT_PLATFORM_SETTINGS.trialSignupEnabled,
      trialDurationDays: row.trialDurationDays ?? DEFAULT_PLATFORM_SETTINGS.trialDurationDays,
      trialPlanSlug: row.trialPlanSlug?.trim() || DEFAULT_PLATFORM_SETTINGS.trialPlanSlug,
      dietitianSignInLabel: row.dietitianSignInLabel || DEFAULT_PLATFORM_SETTINGS.dietitianSignInLabel,
      patientSignInLabel: row.patientSignInLabel || DEFAULT_PLATFORM_SETTINGS.patientSignInLabel,
      footerDescription: row.footerDescription || DEFAULT_PLATFORM_SETTINGS.footerDescription,
      footerGroups: this.asFooterGroups(row.footerGroups),
      copyrightText: row.copyrightText || DEFAULT_PLATFORM_SETTINGS.copyrightText,
      socialLinks: this.asSocialLinks(row.socialLinks),
      contactEmail: row.contactEmail,
      contactPhone: row.contactPhone,
      contactAddress: row.contactAddress,
      contactHours: row.contactHours,
    };
  }

  private asNavItems(value: Prisma.JsonValue): SiteNavItem[] {
    if (!Array.isArray(value)) return DEFAULT_PLATFORM_SETTINGS.navItems;
    return value
      .map((raw, index) => {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
        const item = raw as Record<string, unknown>;
        return {
          href: typeof item.href === "string" ? item.href : "/",
          label: typeof item.label === "string" ? item.label : "Link",
          visible: item.visible !== false,
          order: typeof item.order === "number" ? item.order : index,
        };
      })
      .filter((item): item is SiteNavItem => item !== null)
      .sort((a, b) => a.order - b.order);
  }

  private asFooterGroups(value: Prisma.JsonValue): SiteFooterGroup[] {
    if (!Array.isArray(value)) return DEFAULT_PLATFORM_SETTINGS.footerGroups;
    return value
      .map((raw) => {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
        const item = raw as Record<string, unknown>;
        const linksRaw = Array.isArray(item.links) ? item.links : [];
        return {
          title: typeof item.title === "string" ? item.title : "Links",
          links: linksRaw
            .map((linkRaw) => {
              if (!linkRaw || typeof linkRaw !== "object" || Array.isArray(linkRaw)) return null;
              const link = linkRaw as Record<string, unknown>;
              return {
                href: typeof link.href === "string" ? link.href : "/",
                label: typeof link.label === "string" ? link.label : "Link",
              };
            })
            .filter((link): link is SiteFooterGroup["links"][number] => link !== null),
        };
      })
      .filter((item): item is SiteFooterGroup => item !== null);
  }

  private asSocialLinks(value: Prisma.JsonValue): SiteSocialLink[] {
    if (!Array.isArray(value)) return DEFAULT_PLATFORM_SETTINGS.socialLinks;
    return value
      .map((raw) => {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
        const item = raw as Record<string, unknown>;
        return {
          label: typeof item.label === "string" ? item.label : "Social",
          href: typeof item.href === "string" ? item.href : "#",
        };
      })
      .filter((item): item is SiteSocialLink => item !== null);
  }
}
