import { ConflictException, Injectable } from "@nestjs/common";
import type { DateFormat, HeightUnit, WeightUnit } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { slugify } from "@nutrition-saas/utilities";
import { PrismaService } from "../prisma/prisma.service";
import { SecurityEventLogger } from "../auth/security-event.logger";
import { tenantWhere } from "./tenant-scope";
import type { CreateOrganizationDto, OrganizationSettingsInputDto, UpdateOrganizationSettingsDto } from "./dto/organization.dto";

@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly security: SecurityEventLogger,
  ) {}

  async create(userId: string, input: CreateOrganizationDto) {
    const slug = await this.allocateSlug(input.slug?.trim() || slugify(input.name));

    const organization = await this.prisma.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: {
          name: input.name.trim(),
          slug,
          status: "ACTIVE",
          createdById: userId,
        },
      });

      await tx.organizationSettings.create({
        data: {
          organizationId: created.id,
          ...this.settingsData(input.settings),
        },
      });

      await tx.organizationMember.create({
        data: {
          organizationId: created.id,
          userId,
          role: "OWNER",
          status: "ACTIVE",
          joinedAt: new Date(),
        },
      });

      return created;
    });

    await this.security.record({
      type: "organization_created",
      outcome: "success",
      userId,
      organizationId: organization.id,
    });
    await this.security.record({
      type: "membership_created",
      outcome: "success",
      userId,
      organizationId: organization.id,
      reason: "OWNER",
    });

    return this.getForUser(userId, organization.id);
  }

  async listForUser(userId: string) {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId, status: "ACTIVE" },
      include: { organization: true },
      orderBy: { createdAt: "asc" },
    });

    return memberships.map((membership) => this.toResponse(membership));
  }

  async getForUser(userId: string, organizationId: string) {
    const membership = await this.prisma.organizationMember.findFirst({
      where: {
        ...tenantWhere(organizationId),
        userId,
        status: "ACTIVE",
      },
      include: {
        organization: { include: { settings: true } },
      },
    });

    if (!membership) {
      return null;
    }

    return this.toResponse(membership, membership.organization.settings ?? undefined);
  }

  async updateName(organizationId: string, name: string) {
    return this.prisma.organization.update({
      where: { id: organizationId },
      data: { name: name.trim() },
    });
  }

  async getSettings(organizationId: string) {
    return this.prisma.organizationSettings.findUnique({
      where: { organizationId },
    });
  }

  async updateSettings(organizationId: string, settings: UpdateOrganizationSettingsDto) {
    return this.prisma.organizationSettings.update({
      where: { organizationId },
      data: this.settingsData(settings),
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

  private toResponse(
    membership: {
      role: string;
      status: string;
      organization: { id: string; name: string; slug: string; status: string; createdAt: Date };
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
      id: membership.organization.id,
      name: membership.organization.name,
      slug: membership.organization.slug,
      status: membership.organization.status,
      role: membership.role,
      membershipStatus: membership.status,
      createdAt: membership.organization.createdAt.toISOString(),
      ...(settings ? { settings: this.toSettingsResponse(settings) } : {}),
    };
  }

  private async allocateSlug(base: string): Promise<string> {
    const normalized = slugify(base);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = attempt === 0 ? normalized : `${normalized}-${randomBytes(2).toString("hex")}`;
      const existing = await this.prisma.organization.findUnique({ where: { slug: candidate } });
      if (!existing) {
        return candidate;
      }
    }
    throw new ConflictException("Unable to allocate a unique organization slug");
  }
}
