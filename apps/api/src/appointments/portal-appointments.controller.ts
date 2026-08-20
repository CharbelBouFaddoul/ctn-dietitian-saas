import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentSession, CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionGuard } from "../auth/guards/session.guard";
import type { AuthenticatedRequestUser, AuthenticatedSession } from "../auth/auth.types";
import { AppointmentService } from "./appointment.service";
import { ProposeRescheduleDto } from "./dto/appointment.dto";

@ApiTags("portal")
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller("api/v1/portal/appointments")
export class PortalAppointmentsController {
  constructor(private readonly appointments: AppointmentService) {}

  @Get()
  @ApiOperation({ summary: "List appointments for the active portal connection" })
  list(@CurrentUser() user: AuthenticatedRequestUser, @CurrentSession() session: AuthenticatedSession) {
    return this.appointments.listForPortal(user.id, session.activeClientId);
  }

  @Get(":appointmentId")
  getOne(
    @CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession,
    @Param("appointmentId", ParseUUIDPipe) appointmentId: string,
  ) {
    return this.appointments.getForPortal(user.id, appointmentId, session.activeClientId);
  }

  @Post(":appointmentId/cancel")
  cancel(
    @CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession,
    @Param("appointmentId", ParseUUIDPipe) appointmentId: string,
  ) {
    return this.appointments.cancelForPortal(user.id, appointmentId, session.activeClientId);
  }

  @Post(":appointmentId/propose-reschedule")
  proposeReschedule(
    @CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession,
    @Param("appointmentId", ParseUUIDPipe) appointmentId: string,
    @Body() body: ProposeRescheduleDto,
  ) {
    return this.appointments.proposeRescheduleForPortal(
      user.id,
      appointmentId,
      body.startAt,
      body.endAt,
      session.activeClientId,
    );
  }

  @Post(":appointmentId/accept-reschedule")
  acceptReschedule(
    @CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession,
    @Param("appointmentId", ParseUUIDPipe) appointmentId: string,
  ) {
    return this.appointments.acceptRescheduleForPortal(user.id, appointmentId, session.activeClientId);
  }

  @Post(":appointmentId/reject-reschedule")
  rejectReschedule(
    @CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession,
    @Param("appointmentId", ParseUUIDPipe) appointmentId: string,
  ) {
    return this.appointments.rejectRescheduleForPortal(user.id, appointmentId, session.activeClientId);
  }
}
