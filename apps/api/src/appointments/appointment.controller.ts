import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";
import { SessionGuard } from "../auth/guards/session.guard";
import { CurrentTenant } from "../dietitian/decorators/current-tenant.decorator";
import { DietitianGuard } from "../dietitian/guards/dietitian.guard";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
import { ClientActionRequired } from "../clients/decorators/client-action.decorator";
import { ClientAccessGuard } from "../clients/guards/client-access.guard";
import { AppointmentService } from "./appointment.service";

class CreateAppointmentDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title!: string;

  @ApiProperty()
  @IsDateString()
  startAt!: string;

  @ApiProperty()
  @IsDateString()
  endAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedUserId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

class UpdateAppointmentStatusDto {
  @ApiProperty({ enum: ["SCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW"] })
  @IsEnum(["SCHEDULED", "COMPLETED", "CANCELLED", "NO_SHOW"])
  status!: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

@ApiTags("appointments")
@ApiCookieAuth()
@UseGuards(SessionGuard, DietitianGuard)
@Controller("api/v1/dietitian/:dietitianAccountId")
export class AppointmentController {
  constructor(private readonly appointments: AppointmentService) {}

  @Get("appointments")
  upcoming(@CurrentTenant() tenant: DietitianTenantContext) {
    return this.appointments.listUpcoming(tenant);
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
