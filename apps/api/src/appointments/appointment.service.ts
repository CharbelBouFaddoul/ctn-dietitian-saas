import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { AppointmentStatus, NotificationType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SecurityEventLogger } from "../auth/security-event.logger";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
import { tenantWhere } from "../dietitian/tenant-scope";
import { TimelineService } from "../timeline/timeline.service";
import { ClientAccessService } from "../clients/client-access.service";
import { NotificationService } from "../notifications/notification.service";

@Injectable()
export class AppointmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClientAccessService,
    private readonly timeline: TimelineService,
    private readonly security: SecurityEventLogger,
    private readonly notifications: NotificationService,
  ) {}

  async listForClient(tenant: DietitianTenantContext, clientId: string) {
    await this.access.assertCanAccess(tenant, clientId, "read");
    const rows = await this.prisma.appointment.findMany({
      where: { clientId, ...tenantWhere(tenant.dietitianAccountId) },
      orderBy: { startAt: "asc" },
    });
    return rows.map((row) => this.toResponse(row));
  }

  async listUpcoming(tenant: DietitianTenantContext) {
    const visible = this.access.visibleWhere(tenant);
    const from = new Date();
    from.setDate(from.getDate() - 30);
    const rows = await this.prisma.appointment.findMany({
      where: {
        ...tenantWhere(tenant.dietitianAccountId),
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
    tenant: DietitianTenantContext,
    clientId: string,
    input: {
      title: string;
      startAt: string;
      endAt: string;
      assignedUserId?: string;
      notes?: string;
    },
  ) {
    await this.access.assertCanAccess(tenant, clientId, "manageRecords");
    const startAt = new Date(input.startAt);
    const endAt = new Date(input.endAt);
    if (!(startAt.getTime() < endAt.getTime())) {
      throw new BadRequestException("Appointment end must be after start");
    }
    const appointment = await this.prisma.appointment.create({
      data: {
        dietitianAccountId: tenant.dietitianAccountId,
        clientId,
        title: input.title.trim(),
        startAt,
        endAt,
        assignedUserId: input.assignedUserId ?? tenant.userId,
        notes: input.notes?.trim() ?? null,
        createdById: tenant.userId,
      },
    });
    await this.timeline.record({
      dietitianAccountId: tenant.dietitianAccountId,
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
      dietitianAccountId: tenant.dietitianAccountId,
      targetType: "appointment",
      targetId: appointment.id,
    });
    await this.notifyAppointmentParties({
      tenant,
      clientId,
      appointmentId: appointment.id,
      title: appointment.title,
      type: "APPOINTMENT_CREATED",
      body: `Appointment scheduled: ${appointment.title}`,
      excludeUserId: tenant.userId,
    });
    return this.toResponse(appointment);
  }

  async updateStatus(
    tenant: DietitianTenantContext,
    clientId: string,
    appointmentId: string,
    status: AppointmentStatus,
    notes?: string,
  ) {
    await this.access.assertCanAccess(tenant, clientId, "manageRecords");
    const existing = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, clientId, ...tenantWhere(tenant.dietitianAccountId) },
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
      dietitianAccountId: tenant.dietitianAccountId,
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
      dietitianAccountId: tenant.dietitianAccountId,
      targetType: "appointment",
      targetId: appointment.id,
      metadata: { status },
    });

    const notifType: NotificationType =
      status === "CANCELLED" ? "APPOINTMENT_CANCELLED" : "APPOINTMENT_UPDATED";
    await this.notifyAppointmentParties({
      tenant,
      clientId,
      appointmentId: appointment.id,
      title: appointment.title,
      type: notifType,
      body:
        status === "CANCELLED"
          ? `Appointment cancelled: ${appointment.title}`
          : `Appointment updated (${status}): ${appointment.title}`,
      excludeUserId: tenant.userId,
    });
    return this.toResponse(appointment);
  }

  private async notifyAppointmentParties(input: {
    tenant: DietitianTenantContext;
    clientId: string;
    appointmentId: string;
    title: string;
    type: NotificationType;
    body: string;
    excludeUserId?: string;
  }) {
    const account = await this.prisma.dietitianAccount.findUnique({
      where: { id: input.tenant.dietitianAccountId },
      select: { userId: true },
    });
    const portal = await this.prisma.clientAccount.findUnique({
      where: { clientId: input.clientId },
      select: { userId: true, status: true },
    });
    const recipients = new Set<string>();
    if (account?.userId) recipients.add(account.userId);
    if (portal?.userId && portal.status === "ACTIVE") recipients.add(portal.userId);
    if (input.excludeUserId) recipients.delete(input.excludeUserId);

    await Promise.all(
      [...recipients].map((userId) =>
        this.notifications.create({
          dietitianAccountId: input.tenant.dietitianAccountId,
          userId,
          clientId: input.clientId,
          type: input.type,
          title: input.title,
          body: input.body,
          targetType: "appointment",
          targetId: input.appointmentId,
        }),
      ),
    );
  }

  private toResponse(row: {
    id: string;
    title: string;
    startAt: Date;
    endAt: Date;
    status: string;
    notes: string | null;
    assignedUserId: string | null;
  }) {
    return {
      id: row.id,
      title: row.title,
      startAt: row.startAt.toISOString(),
      endAt: row.endAt.toISOString(),
      status: row.status,
      notes: row.notes,
      assignedUserId: row.assignedUserId,
    };
  }
}
