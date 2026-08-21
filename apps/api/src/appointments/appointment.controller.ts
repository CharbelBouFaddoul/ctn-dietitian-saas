import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { SessionGuard } from "../auth/guards/session.guard";
import { CurrentTenant } from "../dietitian/decorators/current-tenant.decorator";
import { DietitianGuard } from "../dietitian/guards/dietitian.guard";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
import { ClientActionRequired } from "../clients/decorators/client-action.decorator";
import { ClientAccessGuard } from "../clients/guards/client-access.guard";
import { AppointmentService } from "./appointment.service";
import {
  AppointmentRangeQueryDto,
  CreateAppointmentDto,
  ProposeRescheduleDto,
  UpdateAppointmentDto,
  UpdateAppointmentStatusDto,
} from "./dto/appointment.dto";

@ApiTags("appointments")
@ApiCookieAuth()
@UseGuards(SessionGuard, DietitianGuard)
@Controller("api/v1/dietitian/:dietitianAccountId")
export class AppointmentController {
  constructor(private readonly appointments: AppointmentService) {}

  @Get("appointments")
  listRange(@CurrentTenant() tenant: DietitianTenantContext, @Query() query: AppointmentRangeQueryDto) {
    return this.appointments.listInRange(tenant, query.from, query.to);
  }

  @Get("appointments/:appointmentId")
  getOne(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("appointmentId", ParseUUIDPipe) appointmentId: string,
  ) {
    return this.appointments.getForPractice(tenant, appointmentId);
  }

  @Patch("appointments/:appointmentId")
  updateOne(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("appointmentId", ParseUUIDPipe) appointmentId: string,
    @Body() body: UpdateAppointmentDto,
  ) {
    return this.appointments.update(tenant, appointmentId, body);
  }

  @Post("appointments/:appointmentId/cancel")
  cancel(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("appointmentId", ParseUUIDPipe) appointmentId: string,
  ) {
    return this.appointments.cancelForPractice(tenant, appointmentId);
  }

  @Post("appointments/:appointmentId/accept-cancellation")
  acceptCancellation(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("appointmentId", ParseUUIDPipe) appointmentId: string,
  ) {
    return this.appointments.acceptCancellationForPractice(tenant, appointmentId);
  }

  @Post("appointments/:appointmentId/reject-cancellation")
  rejectCancellation(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("appointmentId", ParseUUIDPipe) appointmentId: string,
  ) {
    return this.appointments.rejectCancellationForPractice(tenant, appointmentId);
  }

  @Post("appointments/:appointmentId/propose-reschedule")
  proposeReschedule(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("appointmentId", ParseUUIDPipe) appointmentId: string,
    @Body() body: ProposeRescheduleDto,
  ) {
    return this.appointments.proposeRescheduleForPractice(
      tenant,
      appointmentId,
      body.startAt,
      body.endAt,
    );
  }

  @Post("appointments/:appointmentId/accept-reschedule")
  acceptReschedule(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("appointmentId", ParseUUIDPipe) appointmentId: string,
  ) {
    return this.appointments.acceptRescheduleForPractice(tenant, appointmentId);
  }

  @Post("appointments/:appointmentId/reject-reschedule")
  rejectReschedule(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("appointmentId", ParseUUIDPipe) appointmentId: string,
  ) {
    return this.appointments.rejectRescheduleForPractice(tenant, appointmentId);
  }

  @Get("clients/:clientId/appointments")
  @UseGuards(ClientAccessGuard)
  list(@CurrentTenant() tenant: DietitianTenantContext, @Param("clientId", ParseUUIDPipe) clientId: string) {
    return this.appointments.listForClient(tenant, clientId);
  }

  @Post("clients/:clientId/appointments")
  @UseGuards(ClientAccessGuard)
  @ClientActionRequired("manageRecords")
  create(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Body() body: CreateAppointmentDto,
  ) {
    return this.appointments.create(tenant, clientId, body);
  }

  @Patch("clients/:clientId/appointments/:appointmentId")
  @UseGuards(ClientAccessGuard)
  @ClientActionRequired("manageRecords")
  updateStatus(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Param("appointmentId", ParseUUIDPipe) appointmentId: string,
    @Body() body: UpdateAppointmentStatusDto,
  ) {
    return this.appointments.updateStatus(tenant, clientId, appointmentId, body.status, body.notes);
  }
}
