import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import type { AppointmentStatus, DateFormat, EnergyUnit, HeightUnit, WeightUnit } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { slugify } from "@nutrition-saas/utilities";
import { PrismaService } from "../prisma/prisma.service";
import { SecurityEventLogger } from "../auth/security-event.logger";
import { TrialProvisioningService } from "../entitlements/trial-provisioning.service";
import type {
  CreateDietitianDto,
  DietitianSettingsInputDto,
  UpdateDietitianDto,
  UpdateDietitianSettingsDto,
} from "./dto/dietitian.dto";
import {
  defaultAppointmentReminders,
  normalizeAppointmentReminders,
  normalizeEnabledMeasurements,
  normalizeMealPlanShare,
  normalizePortalPresets,
} from "./profile-settings";

function trimOrNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

@Injectable()
export class DietitianService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly security: SecurityEventLogger,
    private readonly trialProvisioning: TrialProvisioningService,
  ) {}

  async create(userId: string, input: CreateDietitianDto) {
    const existingAccount = await this.prisma.dietitianAccount.findUnique({ where: { userId } });
    if (existingAccount) {
      throw new ConflictException("User already has a dietitian account");
    }

    const slug = await this.allocateSlug(input.slug?.trim() || slugify(input.name));
    const settings = this.settingsData(input.settings);

    const account = await this.prisma.$transaction(async (tx) => {
      const dietitianAccount = await tx.dietitianAccount.create({
        data: {
          userId,
          displayName: input.name.trim(),
          slug,
          status: "ACTIVE",
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
      type: "dietitian_account_created",
      outcome: "success",
      userId,
      dietitianAccountId: account.id,
    });

    await this.trialProvisioning.ensureTrialSubscription(account.id);
    await this.trialProvisioning.seedSampleData(account.id, userId);

    return this.getForUser(userId, account.id);
  }

  async listForUser(userId: string) {
    const accounts = await this.prisma.dietitianAccount.findMany({
      where: { userId, status: { not: "ARCHIVED" } },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    });
    return accounts.map((account) => this.toAccountResponse(account));
  }

  async getForUser(userId: string, dietitianAccountId: string) {
    const account = await this.prisma.dietitianAccount.findFirst({
      where: { id: dietitianAccountId, userId },
      include: { settings: true, user: true },
    });
    if (!account) {
      return null;
    }
    return this.toAccountResponse(account, account.settings);
  }

  async updateProfile(dietitianAccountId: string, userId: string, input: UpdateDietitianDto) {
    const account = await this.prisma.dietitianAccount.findFirst({
      where: { id: dietitianAccountId, userId },
    });
    if (!account) {
      return null;
    }

    const accountData: Prisma.DietitianAccountUpdateInput = {};
    if (input.name !== undefined) accountData.displayName = input.name.trim();
    if (input.phone !== undefined) accountData.phone = trimOrNull(input.phone);
    if (input.professionalTitle !== undefined) accountData.professionalTitle = trimOrNull(input.professionalTitle);
    if (input.specialization !== undefined) accountData.specialization = trimOrNull(input.specialization);
    if (input.country !== undefined) accountData.country = trimOrNull(input.country);
    if (input.licenseNumber !== undefined) accountData.licenseNumber = trimOrNull(input.licenseNumber);

    const userData: Prisma.UserUpdateInput = {};
    if (input.firstName !== undefined) userData.firstName = trimOrNull(input.firstName);
    if (input.lastName !== undefined) userData.lastName = trimOrNull(input.lastName);

    if (Object.keys(accountData).length === 0 && Object.keys(userData).length === 0) {
      throw new BadRequestException("No profile fields to update");
    }

    await this.prisma.$transaction(async (tx) => {
      if (Object.keys(accountData).length > 0) {
        await tx.dietitianAccount.update({ where: { id: dietitianAccountId }, data: accountData });
      }
      if (Object.keys(userData).length > 0) {
        await tx.user.update({ where: { id: userId }, data: userData });
      }
    });

    return this.getForUser(userId, dietitianAccountId);
  }

  async updateName(dietitianAccountId: string, name: string) {
    const trimmed = name.trim();
    return this.prisma.dietitianAccount.update({
      where: { id: dietitianAccountId },
      data: { displayName: trimmed },
    });
  }

  async getSettings(dietitianAccountId: string) {
    return this.prisma.dietitianSettings.findUnique({
      where: { dietitianAccountId },
    });
  }

  async updateSettings(dietitianAccountId: string, settings: UpdateDietitianSettingsDto) {
    const data = this.settingsData(settings);
    return this.prisma.dietitianSettings.update({
      where: { dietitianAccountId },
      data,
    });
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
    invoiceDefaultTaxPercent?: number | { toString(): string } | null;
    invoiceFooter: string | null;
    emailFromName: string | null;
    emailReplyTo: string | null;
    energyUnit?: string;
    defaultAppointmentStatus?: string;
    appointmentReminders?: Prisma.JsonValue | null;
    mealPlanShare?: Prisma.JsonValue | null;
    enabledMeasurements?: Prisma.JsonValue | null;
    deduceMeasurements?: boolean;
    portalPresets?: Prisma.JsonValue | null;
  }) {
    const reminders = normalizeAppointmentReminders(
      settings.appointmentReminders,
      settings.reminderHoursBefore,
    );
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
      reminderHoursBefore: reminders[0] ?? settings.reminderHoursBefore,
      invoiceDefaultDueDays: settings.invoiceDefaultDueDays,
      invoiceDefaultTaxPercent: Number((settings.invoiceDefaultTaxPercent ?? 0).toString()),
      invoiceFooter: settings.invoiceFooter,
      emailFromName: settings.emailFromName,
      emailReplyTo: settings.emailReplyTo,
      energyUnit: settings.energyUnit ?? "kcal",
      defaultAppointmentStatus: settings.defaultAppointmentStatus ?? "SCHEDULED",
      appointmentReminders: reminders,
      mealPlanShare: normalizeMealPlanShare(settings.mealPlanShare),
      enabledMeasurements: normalizeEnabledMeasurements(settings.enabledMeasurements),
      deduceMeasurements: settings.deduceMeasurements ?? true,
      portalPresets: normalizePortalPresets(settings.portalPresets),
    };
  }

  private settingsData(settings: DietitianSettingsInputDto | UpdateDietitianSettingsDto) {
    const update = settings as UpdateDietitianSettingsDto;
    const reminders =
      update.appointmentReminders !== undefined
        ? normalizeAppointmentReminders(update.appointmentReminders, update.reminderHoursBefore ?? 24)
        : undefined;
    const enabled =
      update.enabledMeasurements !== undefined
        ? normalizeEnabledMeasurements(update.enabledMeasurements)
        : undefined;
    const mealPlanShare =
      update.mealPlanShare !== undefined ? normalizeMealPlanShare(update.mealPlanShare) : undefined;
    const portalPresets =
      update.portalPresets !== undefined ? normalizePortalPresets(update.portalPresets) : undefined;
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
      ...(reminders
        ? { appointmentReminders: reminders, reminderHoursBefore: reminders[0]! }
        : update.reminderHoursBefore !== undefined
          ? {
              reminderHoursBefore: update.reminderHoursBefore,
              appointmentReminders: defaultAppointmentReminders(update.reminderHoursBefore),
            }
          : {}),
      ...(update.invoiceDefaultDueDays !== undefined ? { invoiceDefaultDueDays: update.invoiceDefaultDueDays } : {}),
      ...(update.invoiceDefaultTaxPercent !== undefined
        ? { invoiceDefaultTaxPercent: update.invoiceDefaultTaxPercent }
        : {}),
      ...(update.invoiceFooter !== undefined ? { invoiceFooter: update.invoiceFooter } : {}),
      ...(update.emailFromName !== undefined ? { emailFromName: update.emailFromName } : {}),
      ...(update.emailReplyTo !== undefined ? { emailReplyTo: update.emailReplyTo } : {}),
      ...(update.energyUnit !== undefined ? { energyUnit: update.energyUnit as EnergyUnit } : {}),
      ...(update.defaultAppointmentStatus !== undefined
        ? { defaultAppointmentStatus: update.defaultAppointmentStatus as AppointmentStatus }
        : {}),
      ...(mealPlanShare !== undefined ? { mealPlanShare } : {}),
      ...(enabled !== undefined ? { enabledMeasurements: enabled === null ? Prisma.DbNull : enabled } : {}),
      ...(update.deduceMeasurements !== undefined ? { deduceMeasurements: update.deduceMeasurements } : {}),
      ...(portalPresets !== undefined ? { portalPresets } : {}),
    };
  }

  private toAccountResponse(
    account: {
      id: string;
      displayName: string;
      slug: string;
      status: string;
      createdAt: Date;
      phone?: string | null;
      professionalTitle?: string | null;
      specialization?: string | null;
      country?: string | null;
      licenseNumber?: string | null;
      photoStorageKey?: string | null;
      trialSeedStatus?: string;
      user?: { email: string; firstName: string | null; lastName: string | null };
    },
    settings?: Parameters<DietitianService["toSettingsResponse"]>[0] | null,
  ) {
    return {
      id: account.id,
      name: account.displayName,
      slug: account.slug,
      status: account.status,
      createdAt: account.createdAt.toISOString(),
      email: account.user?.email ?? null,
      firstName: account.user?.firstName ?? null,
      lastName: account.user?.lastName ?? null,
      phone: account.phone ?? null,
      professionalTitle: account.professionalTitle ?? null,
      specialization: account.specialization ?? null,
      country: account.country ?? null,
      licenseNumber: account.licenseNumber ?? null,
      photoStorageKey: account.photoStorageKey ?? null,
      trialSeedStatus: account.trialSeedStatus ?? "NONE",
      ...(settings ? { settings: this.toSettingsResponse(settings) } : {}),
    };
  }

  private async allocateSlug(base: string): Promise<string> {
    const normalized = slugify(base);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = attempt === 0 ? normalized : `${normalized}-${randomBytes(2).toString("hex")}`;
      const existingAccount = await this.prisma.dietitianAccount.findUnique({ where: { slug: candidate } });
      if (!existingAccount) {
        return candidate;
      }
    }
    throw new ConflictException("Unable to allocate a unique practice slug");
  }
}

export const MULTI_MEMBER_UNSUPPORTED = "Multi-member practices are not supported";

export function rejectMultiMember(): never {
  throw new BadRequestException(MULTI_MEMBER_UNSUPPORTED);
}
