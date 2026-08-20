import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { AppointmentStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SecurityEventLogger } from "../auth/security-event.logger";
import type { TenantContext } from "../organizations/tenant.types";
import { legacyOrganizationId, tenantWhere } from "../organizations/tenant-scope";
import { TimelineService } from "../timeline/timeline.service";
import { ClientAccessService } from "../clients/client-access.service";

@Injectable()
export class AppointmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClientAccessService,
    private readonly timeline: TimelineService,
    private readonly security: SecurityEventLogger,
  ) {}

  async listForClient(tenant: TenantContext, clientId: string) {
    await this.access.assertCanAccess(tenant, clientId, "read");
    const rows = await this.prisma.appointment.findMany({
      where: { clientId, ...tenantWhere(tenant.organizationId) },
      orderBy: { startAt: "asc" },
    });
    return rows.map((row) => this.toResponse(row));
  }

  async listUpcoming(tenant: TenantContext) {
    const visible = this.access.visibleWhere(tenant);
    const from = new Date();
    from.setDate(from.getDate() - 30);
    const rows = await this.prisma.appointment.findMany({
      where: {
        ...tenantWhere(tenant.organizationId),
        startAt: { gte: from },
        status: { not: "CANCELLED" },
        client: visible,
      },
      include: { client: true },
      orderBy: { startAt: "asc" },
      take: 100,
    });
    return rows.map((row) => ({
      ...this.toResponse(row),
      client: {
        id: row.client.id,
        displayName: row.client.displayName,
        firstName: row.client.firstName,
        lastName: row.client.lastName,
        email: row.client.email,
      },
    }));
  }

  async create(
    tenant: TenantContext,
    clientId: string,
    input: { title: string; startAt: string; endAt: string; assignedMemberId?: string; notes?: string },
  ) {
    await this.access.assertCanAccess(tenant, clientId, "manageRecords");
    const startAt = new Date(input.startAt);
    const endAt = new Date(input.endAt);
    if (!(startAt.getTime() < endAt.getTime())) {
      throw new BadRequestException("Appointment end must be after start");
    }
    const appointment = await this.prisma.appointment.create({
      data: {
        dietitianAccountId: tenant.organizationId,
        organizationId: legacyOrganizationId(tenant),
        clientId,
        title: input.title.trim(),
        startAt,
        endAt,
        assignedUserId: tenant.userId,
        assignedMemberId: null,
        notes: input.notes?.trim() ?? null,
        createdById: tenant.userId,
      },
    });
    await this.timeline.record({
      organizationId: tenant.organizationId,
      legacyOrganizationId: legacyOrganizationId(tenant),
      clientId,
      type: "APPOINTMENT_CREATED",
      actorUserId: tenant.userId,
      targetType: "appointment",
      targetId: appointment.id,
      metadata: { title: appointment.title },
    });
    await this.security.record({
      type: "appointment_created",
      outcome: "success",
      userId: tenant.userId,
      organizationId: tenant.organizationId,
      dietitianAccountId: tenant.organizationId,
      targetType: "appointment",
      targetId: appointment.id,
    });
    return this.toResponse(appointment);
  }

  async updateStatus(
    tenant: TenantContext,
    clientId: string,
    appointmentId: string,
    status: AppointmentStatus,
    notes?: string,
  ) {
    await this.access.assertCanAccess(tenant, clientId, "manageRecords");
    const existing = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, clientId, ...tenantWhere(tenant.organizationId) },
    });
    if (!existing) {
      throw new NotFoundException("Appointment not found");
    }
    const appointment = await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: { status, notes: notes === undefined ? undefined : notes },
    });
    const timelineType =
      status === "COMPLETED"
        ? "APPOINTMENT_COMPLETED"
        : status === "CANCELLED"
          ? "APPOINTMENT_CANCELLED"
          : "APPOINTMENT_UPDATED";
    await this.timeline.record({
      organizationId: tenant.organizationId,
      legacyOrganizationId: legacyOrganizationId(tenant),
      clientId,
      type: timelineType,
      actorUserId: tenant.userId,
      targetType: "appointment",
      targetId: appointment.id,
      metadata: { status },
    });
    await this.security.record({
      type: "appointment_changed",
      outcome: "success",
      userId: tenant.userId,
      organizationId: tenant.organizationId,
      dietitianAccountId: tenant.organizationId,
      targetType: "appointment",
      targetId: appointment.id,
      metadata: { status },
    });
    return this.toResponse(appointment);
  }

  private toResponse(row: {
    id: string;
    title: string;
    startAt: Date;
    endAt: Date;
    status: string;
    notes: string | null;
    assignedMemberId: string | null;
    assignedUserId?: string | null;
  }) {
    return {
      id: row.id,
      title: row.title,
      startAt: row.startAt.toISOString(),
      endAt: row.endAt.toISOString(),
      status: row.status,
      notes: row.notes,
      assignedMemberId: row.assignedMemberId,
      assignedUserId: row.assignedUserId ?? null,
    };
  }
}
