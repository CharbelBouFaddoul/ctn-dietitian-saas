import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { IsBoolean, IsNumber, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { SessionGuard } from "../auth/guards/session.guard";
import { CurrentTenant } from "../dietitian/decorators/current-tenant.decorator";
import { DietitianGuard } from "../dietitian/guards/dietitian.guard";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
import { HabitCatalogService } from "./habit-catalog.service";

class CreateHabitDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  defaultTargetValue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  defaultTargetUnit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

class UpdateHabitDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  defaultTargetValue?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  defaultTargetUnit?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

@ApiTags("habits")
@ApiCookieAuth()
@UseGuards(SessionGuard, DietitianGuard)
@Controller("api/v1/dietitian/:dietitianAccountId/habits")
export class PracticeHabitController {
  constructor(private readonly habits: HabitCatalogService) {}

  @Get()
  list(@CurrentTenant() tenant: DietitianTenantContext) {
    return this.habits.listCatalog(tenant);
  }

  @Post()
  create(@CurrentTenant() tenant: DietitianTenantContext, @Body() body: CreateHabitDto) {
    return this.habits.createPracticeHabit(tenant, body);
  }

  @Patch(":habitId")
  update(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("habitId", ParseUUIDPipe) habitId: string,
    @Body() body: UpdateHabitDto,
  ) {
    return this.habits.updatePracticeHabit(tenant, habitId, body);
  }
}
