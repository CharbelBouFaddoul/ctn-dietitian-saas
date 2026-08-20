import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  Appointment,
  AppointmentCategory,
  AppointmentStatus,
  NotificationType,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SecurityEventLogger } from "../auth/security-event.logger";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
import { requireDietitianAccountId, tenantWhere } from "../dietitian/tenant-scope";
import { TimelineService } from "../timeline/timeline.service";
import { ClientAccessService } from "../clients/client-access.service";
import { CLIENT_ACCESS_DENIED } from "../clients/client.messages";
import { NotificationService } from "../notifications/notification.service";
import type { AppointmentCategoryValue } from "./dto/appointment.dto";

const BLOCKING_STATUSES: AppointmentStatus[] = ["SCHEDULED", "RESCHEDULE_PENDING"];

type AppointmentRow = Appointment & {
  client?: {
    id: string;
    displayName: string | null;
    firstName: string;
    lastName: string;
    email: string | null;
  };
};

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

  async listInRange(tenant: DietitianTenantContext, from?: string, to?: string) {
    const visible = this.access.visibleWhere(tenant);
    let rangeStart: Date;
    let rangeEnd: Date | undefined;
    if (from || to) {
      rangeStart = from ? this.parseDate(from, "from") : new Date(0);
      rangeEnd = to ? this.parseDate(to, "to") : undefined;
      if (rangeEnd && !(rangeStart.getTime() < rangeEnd.getTime())) {
        throw new BadRequestException("Appointment range end must be after start");
      }
    } else {
      rangeStart = new Date();
      rangeStart.setDate(rangeStart.getDate() - 30);
    }

    const rows = await this.prisma.appointment.findMany({
      where: {
        ...tenantWhere(tenant.dietitianAccountId),
        startAt: rangeEnd ? { gte: rangeStart, lt: rangeEnd } : { gte: rangeStart },
        status: { not: "CANCELLED" },
        client: visible,
      },
      include: { client: true },
      orderBy: { startAt: "asc" },
      take: 500,
    });
    return rows.map((row) => this.toResponseWithClient(row));
  }

  /** @deprecated Prefer listInRange; kept for callers expecting upcoming-style list. */
  async listUpcoming(tenant: DietitianTenantContext) {
    return this.listInRange(tenant);
  }

  async getForPractice(tenant: DietitianTenantContext, appointmentId: string) {
    const row = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, ...tenantWhere(tenant.dietitianAccountId) },
      include: { client: true },
    });
    if (!row) {
      throw new NotFoundException("Appointment not found");
    }
    await this.access.assertCanAccess(tenant, row.clientId, "read");
    return this.toResponseWithClient(row);
  }

  async create(
    tenant: DietitianTenantContext,
    clientId: string,
    input: {
      title: string;
      startAt: string;
      endAt: string;
      category?: AppointmentCategoryValue;
      assignedUserId?: string;
      notes?: string;
    },
  ) {
    await this.access.assertCanAccess(tenant, clientId, "manageRecords");
    await this.assertClientOwnedByTenant(tenant.dietitianAccountId, clientId);
    const { startAt, endAt } = this.parseRange(input.startAt, input.endAt);
    await this.assertNoOverlap(tenant.dietitianAccountId, startAt, endAt);

    const appointment = await this.prisma.appointment.create({
      data: {
        dietitianAccountId: tenant.dietitianAccountId,
        clientId,
        title: input.title.trim(),
        category: (input.category ?? "CONSULTATION") as AppointmentCategory,
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
      metadata: { title: appointment.title, category: appointment.category },
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
      dietitianAccountId: tenant.dietitianAccountId,
      clientId,
      appointmentId: appointment.id,
      title: appointment.title,
      type: "APPOINTMENT_CREATED",
      body: `Appointment scheduled: ${appointment.title}`,
      excludeUserId: tenant.userId,
    });
    return this.toResponse(appointment);
  }

  async update(
    tenant: DietitianTenantContext,
    appointmentId: string,
    input: {
      title?: string;
      category?: AppointmentCategoryValue;
      startAt?: string;
      endAt?: string;
      clientId?: string;
      notes?: string;
      status?: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
    },
  ) {
    const existing = await this.requirePracticeAppointment(tenant, appointmentId, "manageRecords");
    if (existing.status === "RESCHEDULE_PENDING") {
      throw new BadRequestException("Resolve or reject the pending reschedule before editing");
    }
    if (existing.status === "CANCELLED") {
      throw new BadRequestException("Cancelled appointments cannot be edited");
    }

    let nextClientId = existing.clientId;
    if (input.clientId && input.clientId !== existing.clientId) {
      await this.access.assertCanAccess(tenant, input.clientId, "manageRecords");
      await this.assertClientOwnedByTenant(tenant.dietitianAccountId, input.clientId);
      nextClientId = input.clientId;
    }

    const startAt = input.startAt ? this.parseDate(input.startAt, "startAt") : existing.startAt;
    const endAt = input.endAt ? this.parseDate(input.endAt, "endAt") : existing.endAt;
    this.assertValidRange(startAt, endAt);
    if (input.startAt || input.endAt) {
      await this.assertNoOverlap(tenant.dietitianAccountId, startAt, endAt, existing.id);
    }

    const nextStatus = input.status ?? existing.status;
    const appointment = await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        title: input.title?.trim() ?? undefined,
        category: input.category as AppointmentCategory | undefined,
        startAt,
        endAt,
        clientId: nextClientId,
        notes: input.notes === undefined ? undefined : input.notes.trim() || null,
        status: nextStatus,
        ...(nextStatus === "CANCELLED"
          ? { proposedStartAt: null, proposedEndAt: null, proposedByUserId: null }
          : {}),
      },
    });

    const timelineType =
      nextStatus === "COMPLETED"
        ? "APPOINTMENT_COMPLETED"
        : nextStatus === "CANCELLED"
          ? "APPOINTMENT_CANCELLED"
          : "APPOINTMENT_UPDATED";
    await this.timeline.record({
      dietitianAccountId: tenant.dietitianAccountId,
      clientId: appointment.clientId,
      type: timelineType,
      actorUserId: tenant.userId,
      targetType: "appointment",
      targetId: appointment.id,
      metadata: { status: appointment.status },
    });

    const notifType: NotificationType =
      nextStatus === "CANCELLED" ? "APPOINTMENT_CANCELLED" : "APPOINTMENT_UPDATED";
    await this.notifyAppointmentParties({
      dietitianAccountId: tenant.dietitianAccountId,
      clientId: appointment.clientId,
      appointmentId: appointment.id,
      title: appointment.title,
      type: notifType,
      body:
        nextStatus === "CANCELLED"
          ? `Appointment cancelled: ${appointment.title}`
          : `Appointment updated: ${appointment.title}`,
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
    const existing = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, clientId, ...tenantWhere(tenant.dietitianAccountId) },
    });
    if (!existing) {
      throw new NotFoundException("Appointment not found");
    }
    return this.update(tenant, appointmentId, {
      status: status as "SCHEDULED" | "COMPLETED" | "CANCELLED" | "NO_SHOW",
      notes,
    });
  }

  async cancelForPractice(tenant: DietitianTenantContext, appointmentId: string) {
    const existing = await this.requirePracticeAppointment(tenant, appointmentId, "manageRecords");
    if (existing.status !== "SCHEDULED" && existing.status !== "RESCHEDULE_PENDING") {
      throw new BadRequestException("Only upcoming appointments can be cancelled");
    }
    const appointment = await this.prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        status: "CANCELLED",
        proposedStartAt: null,
        proposedEndAt: null,
        proposedByUserId: null,
      },
    });
    await this.timeline.record({
      dietitianAccountId: tenant.dietitianAccountId,
      clientId: appointment.clientId,
      type: "APPOINTMENT_CANCELLED",
      actorUserId: tenant.userId,
      targetType: "appointment",
      targetId: appointment.id,
    });
    await this.notifyAppointmentParties({
      dietitianAccountId: tenant.dietitianAccountId,
      clientId: appointment.clientId,
      appointmentId: appointment.id,
      title: appointment.title,
      type: "APPOINTMENT_CANCELLED",
      body: `Appointment cancelled: ${appointment.title}`,
      excludeUserId: tenant.userId,
    });
    return this.toResponse(appointment);
  }

  async proposeRescheduleForPractice(
    tenant: DietitianTenantContext,
    appointmentId: string,
    startAtRaw: string,
    endAtRaw: string,
  ) {
    const existing = await this.requirePracticeAppointment(tenant, appointmentId, "manageRecords");
    return this.proposeReschedule({
      appointment: existing,
      actorUserId: tenant.userId,
      dietitianAccountId: tenant.dietitianAccountId,
      startAtRaw,
      endAtRaw,
    });
  }

  async acceptRescheduleForPractice(tenant: DietitianTenantContext, appointmentId: string) {
    const existing = await this.requirePracticeAppointment(tenant, appointmentId, "manageRecords");
    return this.acceptReschedule({
      appointment: existing,
      actorUserId: tenant.userId,
      dietitianAccountId: tenant.dietitianAccountId,
    });
  }

  async rejectRescheduleForPractice(tenant: DietitianTenantContext, appointmentId: string) {
    const existing = await this.requirePracticeAppointment(tenant, appointmentId, "manageRecords");
    return this.rejectReschedule({
      appointment: existing,
      actorUserId: tenant.userId,
      dietitianAccountId: tenant.dietitianAccountId,
    });
  }

  // --- Portal ---

  async listForPortal(userId: string, activeClientId?: string | null) {
    const client = await this.access.assertPortalAccess(userId, { activeClientId });
    const dietitianAccountId = requireDietitianAccountId(client);
    const rows = await this.prisma.appointment.findMany({
      where: { clientId: client.id, dietitianAccountId },
      orderBy: { startAt: "asc" },
    });
    return rows.map((row) => this.toResponse(row));
  }

  async getForPortal(userId: string, appointmentId: string, activeClientId?: string | null) {
    const appointment = await this.requirePortalAppointment(userId, appointmentId, activeClientId);
    return this.toResponse(appointment);
  }

  async cancelForPortal(userId: string, appointmentId: string, activeClientId?: string | null) {
    const existing = await this.requirePortalAppointment(userId, appointmentId, activeClientId);
    if (existing.status !== "SCHEDULED" && existing.status !== "RESCHEDULE_PENDING") {
      throw new BadRequestException("Only upcoming appointments can be cancelled");
    }
    const appointment = await this.prisma.appointment.update({
      where: { id: existing.id },
      data: {
        status: "CANCELLED",
        proposedStartAt: null,
        proposedEndAt: null,
        proposedByUserId: null,
      },
    });
    await this.timeline.record({
      dietitianAccountId: existing.dietitianAccountId,
      clientId: existing.clientId,
      type: "APPOINTMENT_CANCELLED",
      actorUserId: userId,
      targetType: "appointment",
      targetId: appointment.id,
    });
    await this.notifyAppointmentParties({
      dietitianAccountId: existing.dietitianAccountId,
      clientId: existing.clientId,
      appointmentId: appointment.id,
      title: appointment.title,
      type: "APPOINTMENT_CANCELLED",
      body: `Appointment cancelled: ${appointment.title}`,
      excludeUserId: userId,
    });
    return this.toResponse(appointment);
  }

  async proposeRescheduleForPortal(
    userId: string,
    appointmentId: string,
    startAtRaw: string,
    endAtRaw: string,
    activeClientId?: string | null,
  ) {
    const existing = await this.requirePortalAppointment(userId, appointmentId, activeClientId);
    return this.proposeReschedule({
      appointment: existing,
      actorUserId: userId,
      dietitianAccountId: existing.dietitianAccountId,
      startAtRaw,
      endAtRaw,
    });
  }

  async acceptRescheduleForPortal(
    userId: string,
    appointmentId: string,
    activeClientId?: string | null,
  ) {
    const existing = await this.requirePortalAppointment(userId, appointmentId, activeClientId);
    return this.acceptReschedule({
      appointment: existing,
      actorUserId: userId,
      dietitianAccountId: existing.dietitianAccountId,
    });
  }

  async rejectRescheduleForPortal(
    userId: string,
    appointmentId: string,
    activeClientId?: string | null,
  ) {
    const existing = await this.requirePortalAppointment(userId, appointmentId, activeClientId);
    return this.rejectReschedule({
      appointment: existing,
      actorUserId: userId,
      dietitianAccountId: existing.dietitianAccountId,
    });
  }

  // --- Shared workflow ---

  private async proposeReschedule(input: {
    appointment: Appointment;
    actorUserId: string;
    dietitianAccountId: string;
    startAtRaw: string;
    endAtRaw: string;
  }) {
    const { appointment: existing } = input;
    if (existing.status === "CANCELLED" || existing.status === "COMPLETED" || existing.status === "NO_SHOW") {
      throw new BadRequestException("Cannot reschedule a closed appointment");
    }
    if (existing.status === "RESCHEDULE_PENDING") {
      throw new BadRequestException("A reschedule proposal is already pending");
    }
    const { startAt, endAt } = this.parseRange(input.startAtRaw, input.endAtRaw);
    await this.assertNoOverlap(input.dietitianAccountId, startAt, endAt, existing.id);

    const appointment = await this.prisma.appointment.update({
      where: { id: existing.id },
      data: {
        status: "RESCHEDULE_PENDING",
        proposedStartAt: startAt,
        proposedEndAt: endAt,
        proposedByUserId: input.actorUserId,
      },
    });
    await this.timeline.record({
      dietitianAccountId: input.dietitianAccountId,
      clientId: existing.clientId,
      type: "APPOINTMENT_UPDATED",
      actorUserId: input.actorUserId,
      targetType: "appointment",
      targetId: appointment.id,
      metadata: { action: "propose_reschedule", proposedStartAt: startAt, proposedEndAt: endAt },
    });
    await this.notifyAppointmentParties({
      dietitianAccountId: input.dietitianAccountId,
      clientId: existing.clientId,
      appointmentId: appointment.id,
      title: appointment.title,
      type: "APPOINTMENT_RESCHEDULE_PROPOSED",
      body: `New time proposed for: ${appointment.title}`,
      excludeUserId: input.actorUserId,
    });
    return this.toResponse(appointment);
  }

  private async acceptReschedule(input: {
    appointment: Appointment;
    actorUserId: string;
    dietitianAccountId: string;
  }) {
    const { appointment: existing } = input;
    if (existing.status !== "RESCHEDULE_PENDING" || !existing.proposedStartAt || !existing.proposedEndAt) {
      throw new BadRequestException("No pending reschedule proposal");
    }
    if (existing.proposedByUserId === input.actorUserId) {
      throw new ForbiddenException("You cannot accept your own reschedule proposal");
    }
    await this.assertNoOverlap(
      input.dietitianAccountId,
      existing.proposedStartAt,
      existing.proposedEndAt,
      existing.id,
    );

    const appointment = await this.prisma.appointment.update({
      where: { id: existing.id },
      data: {
        startAt: existing.proposedStartAt,
        endAt: existing.proposedEndAt,
        status: "SCHEDULED",
        proposedStartAt: null,
        proposedEndAt: null,
        proposedByUserId: null,
      },
    });
    await this.timeline.record({
      dietitianAccountId: input.dietitianAccountId,
      clientId: existing.clientId,
      type: "APPOINTMENT_UPDATED",
      actorUserId: input.actorUserId,
      targetType: "appointment",
      targetId: appointment.id,
      metadata: { action: "accept_reschedule" },
    });
    await this.notifyAppointmentParties({
      dietitianAccountId: input.dietitianAccountId,
      clientId: existing.clientId,
      appointmentId: appointment.id,
      title: appointment.title,
      type: "APPOINTMENT_RESCHEDULE_ACCEPTED",
      body: `Reschedule accepted: ${appointment.title}`,
      excludeUserId: input.actorUserId,
    });
    return this.toResponse(appointment);
  }

  private async rejectReschedule(input: {
    appointment: Appointment;
    actorUserId: string;
    dietitianAccountId: string;
  }) {
    const { appointment: existing } = input;
    if (existing.status !== "RESCHEDULE_PENDING") {
      throw new BadRequestException("No pending reschedule proposal");
    }
    if (existing.proposedByUserId === input.actorUserId) {
      throw new ForbiddenException("You cannot reject your own reschedule proposal");
    }

    const appointment = await this.prisma.appointment.update({
      where: { id: existing.id },
      data: {
        status: "SCHEDULED",
        proposedStartAt: null,
        proposedEndAt: null,
        proposedByUserId: null,
      },
    });
    await this.timeline.record({
      dietitianAccountId: input.dietitianAccountId,
      clientId: existing.clientId,
      type: "APPOINTMENT_UPDATED",
      actorUserId: input.actorUserId,
      targetType: "appointment",
      targetId: appointment.id,
      metadata: { action: "reject_reschedule" },
    });
    await this.notifyAppointmentParties({
      dietitianAccountId: input.dietitianAccountId,
      clientId: existing.clientId,
      appointmentId: appointment.id,
      title: appointment.title,
      type: "APPOINTMENT_RESCHEDULE_REJECTED",
      body: `Reschedule rejected: ${appointment.title}`,
      excludeUserId: input.actorUserId,
    });
    return this.toResponse(appointment);
  }

  private async requirePracticeAppointment(
    tenant: DietitianTenantContext,
    appointmentId: string,
    action: "read" | "manageRecords",
  ) {
    const row = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, ...tenantWhere(tenant.dietitianAccountId) },
    });
    if (!row) {
      throw new NotFoundException("Appointment not found");
    }
    await this.access.assertCanAccess(tenant, row.clientId, action);
    return row;
  }

  private async requirePortalAppointment(
    userId: string,
    appointmentId: string,
    activeClientId?: string | null,
  ) {
    const client = await this.access.assertPortalAccess(userId, { activeClientId });
    const dietitianAccountId = requireDietitianAccountId(client);
    const row = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, clientId: client.id, dietitianAccountId },
    });
    if (!row) {
      throw new NotFoundException(CLIENT_ACCESS_DENIED);
    }
    return row;
  }

  private async assertClientOwnedByTenant(dietitianAccountId: string, clientId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, dietitianAccountId },
      select: { id: true },
    });
    if (!client) {
      throw new ForbiddenException(CLIENT_ACCESS_DENIED);
    }
  }

  private async assertNoOverlap(
    dietitianAccountId: string,
    startAt: Date,
    endAt: Date,
    excludeId?: string,
  ) {
    const conflict = await this.prisma.appointment.findFirst({
      where: {
        dietitianAccountId,
        status: { in: BLOCKING_STATUSES },
        id: excludeId ? { not: excludeId } : undefined,
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      select: { id: true },
    });
    if (conflict) {
      throw new ConflictException("Appointment overlaps an existing appointment");
    }
  }

  private parseRange(startRaw: string, endRaw: string) {
    const startAt = this.parseDate(startRaw, "startAt");
    const endAt = this.parseDate(endRaw, "endAt");
    this.assertValidRange(startAt, endAt);
    return { startAt, endAt };
  }

  private parseDate(value: string, field: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Invalid ${field}`);
    }
    return date;
  }

  private assertValidRange(startAt: Date, endAt: Date) {
    if (!(startAt.getTime() < endAt.getTime())) {
      throw new BadRequestException("Appointment end must be after start");
    }
  }

  private async notifyAppointmentParties(input: {
    dietitianAccountId: string;
    clientId: string;
    appointmentId: string;
    title: string;
    type: NotificationType;
    body: string;
    excludeUserId?: string;
  }) {
    const account = await this.prisma.dietitianAccount.findUnique({
      where: { id: input.dietitianAccountId },
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
          dietitianAccountId: input.dietitianAccountId,
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

  private toResponseWithClient(row: AppointmentRow) {
    return {
      ...this.toResponse(row),
      client: row.client
        ? {
            id: row.client.id,
            displayName: row.client.displayName,
            firstName: row.client.firstName,
            lastName: row.client.lastName,
            email: row.client.email,
          }
        : undefined,
    };
  }

  private toResponse(row: Appointment) {
    return {
      id: row.id,
      clientId: row.clientId,
      dietitianAccountId: row.dietitianAccountId,
      title: row.title,
      category: row.category,
      startAt: row.startAt.toISOString(),
      endAt: row.endAt.toISOString(),
      status: row.status,
      notes: row.notes,
      assignedUserId: row.assignedUserId,
      proposedStartAt: row.proposedStartAt?.toISOString() ?? null,
      proposedEndAt: row.proposedEndAt?.toISOString() ?? null,
      proposedByUserId: row.proposedByUserId,
    };
  }
}
