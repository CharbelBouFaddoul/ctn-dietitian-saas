import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, MaxLength } from "class-validator";
import { SessionGuard } from "../auth/guards/session.guard";
import { CurrentTenant } from "../organizations/decorators/current-tenant.decorator";
import { TenantGuard } from "../organizations/guards/tenant.guard";
import type { TenantContext } from "../organizations/tenant.types";
import { ClientActionRequired } from "../clients/decorators/client-action.decorator";
import { ClientAccessGuard } from "../clients/guards/client-access.guard";
import { ClientMeasurementService } from "./client-measurement.service";

class CreateMeasurementDto {
  @ApiProperty({ enum: ["WEIGHT", "HEIGHT", "WAIST", "HIPS", "BODY_FAT", "MUSCLE_MASS"] })
  @IsEnum(["WEIGHT", "HEIGHT", "WAIST", "HIPS", "BODY_FAT", "MUSCLE_MASS"])
  type!: "WEIGHT" | "HEIGHT" | "WAIST" | "HIPS" | "BODY_FAT" | "MUSCLE_MASS";

  @ApiProperty()
  @IsNumber()
  value!: number;

  @ApiProperty()
  @IsString()
  unit!: string;

  @ApiProperty()
  @IsDateString()
  measuredAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

@ApiTags("client-measurements")
@ApiCookieAuth()
@UseGuards(SessionGuard, TenantGuard, ClientAccessGuard)
@Controller("api/v1/organizations/:organizationId/clients/:clientId/measurements")
export class ClientMeasurementController {
  constructor(private readonly measurements: ClientMeasurementService) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext, @Param("clientId", ParseUUIDPipe) clientId: string) {
    return this.measurements.list(tenant, clientId);
  }

  @Post()
  @ClientActionRequired("manageRecords")
  create(
    @CurrentTenant() tenant: TenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Body() body: CreateMeasurementDto,
  ) {
    return this.measurements.create(tenant, clientId, body);
  }
}
