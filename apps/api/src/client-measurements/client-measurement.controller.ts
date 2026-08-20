import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, MaxLength } from "class-validator";
import type { MeasurementType } from "@prisma/client";
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

class MeasurementQueryDto {
  @ApiPropertyOptional({ enum: ["WEIGHT", "HEIGHT", "WAIST", "HIPS", "BODY_FAT", "MUSCLE_MASS"] })
  @IsOptional()
  @IsEnum(["WEIGHT", "HEIGHT", "WAIST", "HIPS", "BODY_FAT", "MUSCLE_MASS"])
  type?: MeasurementType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;
}

@ApiTags("client-measurements")
@ApiCookieAuth()
@UseGuards(SessionGuard, DietitianGuard, ClientAccessGuard)
@Controller("api/v1/dietitian/:dietitianAccountId/clients/:clientId")
export class ClientMeasurementController {
  constructor(private readonly measurements: ClientMeasurementService) {}

  @Get("measurements")
  list(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Query() query: MeasurementQueryDto,
  ) {
    return this.measurements.list(tenant, clientId, query);
  }

  @Get("evolution")
  evolution(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Query() query: MeasurementQueryDto,
  ) {
    return this.measurements.evolution(tenant, clientId, {
      from: query.from,
      to: query.to,
    });
  }

  @Post("measurements")
  @ClientActionRequired("manageRecords")
  create(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Body() body: CreateMeasurementDto,
  ) {
    return this.measurements.create(tenant, clientId, body);
  }
}
