import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { CurrentSession, CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionGuard } from "../auth/guards/session.guard";
import type { AuthenticatedRequestUser, AuthenticatedSession } from "../auth/auth.types";
import { ClientAccessService } from "../clients/client-access.service";
import { ClientMeasurementService } from "./client-measurement.service";

class PortalCreateMeasurementDto {
  @ApiProperty({ enum: ["WEIGHT", "HEIGHT", "WAIST", "HIPS", "BODY_FAT", "MUSCLE_MASS"] })
  @IsEnum(["WEIGHT", "HEIGHT", "WAIST", "HIPS", "BODY_FAT", "MUSCLE_MASS"])
  type!: "WEIGHT" | "HEIGHT" | "WAIST" | "HIPS" | "BODY_FAT" | "MUSCLE_MASS";

  @ApiProperty()
  @IsNumber()
  @Min(0.0001)
  value!: number;

  @ApiProperty()
  @IsString()
  unit!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  measuredAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

@ApiTags("portal")
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller("api/v1/portal/measurements")
export class PortalMeasurementController {
  constructor(
    private readonly access: ClientAccessService,
    private readonly measurements: ClientMeasurementService,
  ) {}

  @Post()
  @ApiOperation({ summary: "Log a measurement for the active portal client" })
  async create(
    @CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession,
    @Body() body: PortalCreateMeasurementDto,
  ) {
    const client = await this.access.assertPortalAccess(user.id, {
      activeClientId: session.activeClientId,
    });
    return this.measurements.createForPortal(client, user.id, body);
  }
}
