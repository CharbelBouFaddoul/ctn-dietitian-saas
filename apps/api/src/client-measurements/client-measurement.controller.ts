import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, MaxLength } from "class-validator";
import { SessionGuard } from "../auth/guards/session.guard";
import { CurrentTenant } from "../dietitian/decorators/current-tenant.decorator";
import { DietitianGuard } from "../dietitian/guards/dietitian.guard";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
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
@UseGuards(SessionGuard, DietitianGuard, ClientAccessGuard)
@Controller("api/v1/dietitian/:dietitianAccountId/clients/:clientId/measurements")
export class ClientMeasurementController {
  constructor(private readonly measurements: ClientMeasurementService) {}

  @Get()
  list(@CurrentTenant() tenant: DietitianTenantContext, @Param("clientId", ParseUUIDPipe) clientId: string) {
    return this.measurements.list(tenant, clientId);
  }

  @Post()
  @ClientActionRequired("manageRecords")
  create(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Body() body: CreateMeasurementDto,
  ) {
    return this.measurements.create(tenant, clientId, body);
  }
}
