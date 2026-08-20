import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import type { DateFormat, HeightUnit, WeightUnit } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { slugify } from "@nutrition-saas/utilities";
import { PrismaService } from "../prisma/prisma.service";
import { SecurityEventLogger } from "../auth/security-event.logger";
import type { CreateOrganizationDto, OrganizationSettingsInputDto, UpdateOrganizationSettingsDto } from "./dto/organization.dto";

@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly security: SecurityEventLogger,
  ) {}

  async create(userId: string, input: CreateOrganizationDto) {
    const existingAccount = await this.prisma.dietitianAccount.findUnique({ where: { userId } });
    if (existingAccount) {
      throw new ConflictException("User already has a dietitian account");
    }

    const slug = await this.allocateSlug(input.slug?.trim() || slugify(input.name));
    const settings = this.settingsData(input.settings);

    const account = await this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: input.name.trim(),
          slug,
          status: "ACTIVE",
          createdById: userId,
        },
      });

      await tx.organizationSettings.create({
        data: {
          organizationId: organization.id,
          ...settings,
        },
      });

      await tx.organizationMember.create({
        data: {
          organizationId: organization.id,
          userId,
          role: "OWNER",
          status: "ACTIVE",
          joinedAt: new Date(),
        },
      });

      const dietitianAccount = await tx.dietitianAccount.create({
        data: {
          id: organization.id,
          userId,
          displayName: organization.name,
          slug: organization.slug,
          status: "ACTIVE",
          legacyOrganizationId: organization.id,
          country: null,
        },
      });

      await tx.dietitianSettings.create({
        data: {
          dietitianAccountId: dietitianAccount.id,
          ...settings,
        },
      });

      return dietitianAccount;
    });

    await this.security.record({
      type: "organization_created",
      outcome: "success",
      userId,
      organizationId: account.id,
      dietitianAccountId: account.id,
    });

    return this.getForUser(userId, account.id);
  }

  async listForUser(userId: string) {
    const accounts = await this.prisma.dietitianAccount.findMany({
      where: { userId, status: { not: "ARCHIVED" } },
      orderBy: { createdAt: "asc" },
    });
    return accounts.map((account) => this.toAccountResponse(account));
  }

  async getForUser(userId: string, dietitianAccountId: string) {
    const account = await this.prisma.dietitianAccount.findFirst({
      where: { id: dietitianAccountId, userId },
      include: { settings: true },
    });
    if (!account) {
      return null;
    }
    return this.toAccountResponse(account, account.settings);
  }

  async updateName(dietitianAccountId: string, name: string) {
    const trimmed = name.trim();
    const account = await this.prisma.dietitianAccount.update({
      where: { id: dietitianAccountId },
      data: { displayName: trimmed },
    });
    if (account.legacyOrganizationId) {
      await this.prisma.organization.updateMany({
        where: { id: account.legacyOrganizationId },
        data: { name: trimmed },
      });
    }
    return account;
  }

  async getSettings(dietitianAccountId: string) {
    return this.prisma.dietitianSettings.findUnique({
      where: { dietitianAccountId },
    });
  }

  async updateSettings(dietitianAccountId: string, settings: UpdateOrganizationSettingsDto) {
    const data = this.settingsData(settings);
    const updated = await this.prisma.dietitianSettings.update({
      where: { dietitianAccountId },
      data,
    });
    const account = await this.prisma.dietitianAccount.findUnique({
      where: { id: dietitianAccountId },
    });
    if (account?.legacyOrganizationId) {
      await this.prisma.organizationSettings.updateMany({
        where: { organizationId: account.legacyOrganizationId },
        data,
      });
    }
    return updated;
  }

  toSettingsResponse(settings: {
    timezone: string;
    locale: string;
    currency: string;
    weightUnit: string;
    heightUnit: string;
    dateFormat: string;
    practiceName: string | null;
    logoStorageKey: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    region: string | null;
    postalCode: string | null;
    country: string | null;
    defaultAppointmentMinutes: number;
    reminderEmailEnabled: boolean;
    reminderHoursBefore: number;
    invoiceDefaultDueDays: number;
    invoiceFooter: string | null;
    emailFromName: string | null;
    emailReplyTo: string | null;
  }) {
    return {
      timezone: settings.timezone,
      locale: settings.locale,
      currency: settings.currency,
      weightUnit: settings.weightUnit,
      heightUnit: settings.heightUnit,
      dateFormat: settings.dateFormat,
      practiceName: settings.practiceName,
      logoStorageKey: settings.logoStorageKey,
      contactEmail: settings.contactEmail,
      contactPhone: settings.contactPhone,
      addressLine1: settings.addressLine1,
      addressLine2: settings.addressLine2,
      city: settings.city,
      region: settings.region,
      postalCode: settings.postalCode,
      country: settings.country,
      defaultAppointmentMinutes: settings.defaultAppointmentMinutes,
      reminderEmailEnabled: settings.reminderEmailEnabled,
      reminderHoursBefore: settings.reminderHoursBefore,
      invoiceDefaultDueDays: settings.invoiceDefaultDueDays,
      invoiceFooter: settings.invoiceFooter,
      emailFromName: settings.emailFromName,
      emailReplyTo: settings.emailReplyTo,
    };
  }

  private settingsData(settings: OrganizationSettingsInputDto | UpdateOrganizationSettingsDto) {
    const update = settings as UpdateOrganizationSettingsDto;
    return {
      timezone: settings.timezone,
      locale: settings.locale,
      currency: settings.currency,
      weightUnit: settings.weightUnit as WeightUnit,
      heightUnit: settings.heightUnit as HeightUnit,
      dateFormat: settings.dateFormat as DateFormat,
      ...(update.practiceName !== undefined ? { practiceName: update.practiceName } : {}),
      ...(update.logoStorageKey !== undefined ? { logoStorageKey: update.logoStorageKey } : {}),
      ...(update.contactEmail !== undefined ? { contactEmail: update.contactEmail } : {}),
      ...(update.contactPhone !== undefined ? { contactPhone: update.contactPhone } : {}),
      ...(update.addressLine1 !== undefined ? { addressLine1: update.addressLine1 } : {}),
      ...(update.addressLine2 !== undefined ? { addressLine2: update.addressLine2 } : {}),
      ...(update.city !== undefined ? { city: update.city } : {}),
      ...(update.region !== undefined ? { region: update.region } : {}),
      ...(update.postalCode !== undefined ? { postalCode: update.postalCode } : {}),
      ...(update.country !== undefined ? { country: update.country } : {}),
      ...(update.defaultAppointmentMinutes !== undefined
        ? { defaultAppointmentMinutes: update.defaultAppointmentMinutes }
        : {}),
      ...(update.reminderEmailEnabled !== undefined ? { reminderEmailEnabled: update.reminderEmailEnabled } : {}),
      ...(update.reminderHoursBefore !== undefined ? { reminderHoursBefore: update.reminderHoursBefore } : {}),
      ...(update.invoiceDefaultDueDays !== undefined ? { invoiceDefaultDueDays: update.invoiceDefaultDueDays } : {}),
      ...(update.invoiceFooter !== undefined ? { invoiceFooter: update.invoiceFooter } : {}),
      ...(update.emailFromName !== undefined ? { emailFromName: update.emailFromName } : {}),
      ...(update.emailReplyTo !== undefined ? { emailReplyTo: update.emailReplyTo } : {}),
    };
  }

  private toAccountResponse(
    account: {
      id: string;
      displayName: string;
      slug: string;
      status: string;
      createdAt: Date;
    },
    settings?: {
      timezone: string;
      locale: string;
      currency: string;
      weightUnit: string;
      heightUnit: string;
      dateFormat: string;
      practiceName: string | null;
      logoStorageKey: string | null;
      contactEmail: string | null;
      contactPhone: string | null;
      addressLine1: string | null;
      addressLine2: string | null;
      city: string | null;
      region: string | null;
      postalCode: string | null;
      country: string | null;
      defaultAppointmentMinutes: number;
      reminderEmailEnabled: boolean;
      reminderHoursBefore: number;
      invoiceDefaultDueDays: number;
      invoiceFooter: string | null;
      emailFromName: string | null;
      emailReplyTo: string | null;
    } | null,
  ) {
    return {
      id: account.id,
      name: account.displayName,
      slug: account.slug,
      status: account.status,
      role: "OWNER" as const,
      membershipStatus: "ACTIVE" as const,
      createdAt: account.createdAt.toISOString(),
      ...(settings ? { settings: this.toSettingsResponse(settings) } : {}),
    };
  }

  private async allocateSlug(base: string): Promise<string> {
    const normalized = slugify(base);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = attempt === 0 ? normalized : `${normalized}-${randomBytes(2).toString("hex")}`;
      const existingOrg = await this.prisma.organization.findUnique({ where: { slug: candidate } });
      const existingAccount = await this.prisma.dietitianAccount.findUnique({ where: { slug: candidate } });
      if (!existingOrg && !existingAccount) {
        return candidate;
      }
    }
    throw new ConflictException("Unable to allocate a unique organization slug");
  }
}

export const MULTI_MEMBER_UNSUPPORTED = "Multi-member practices are not supported";

export function rejectMultiMember(): never {
  throw new BadRequestException(MULTI_MEMBER_UNSUPPORTED);
}
