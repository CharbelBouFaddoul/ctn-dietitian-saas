import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsDateString, IsInt, IsOptional, Max, Min } from "class-validator";
import { SessionGuard } from "../auth/guards/session.guard";
import { CurrentTenant } from "../dietitian/decorators/current-tenant.decorator";
import { DietitianGuard } from "../dietitian/guards/dietitian.guard";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
import { ClientAccessGuard } from "../clients/guards/client-access.guard";
import { TimelineService } from "./timeline.service";

class TimelineQueryDto {
  @ApiPropertyOptional({ description: "ISO timestamp — return events strictly before this time" })
  @IsOptional()
  @IsDateString()
  before?: string;

  @ApiPropertyOptional({ description: "YYYY-MM-DD — return events on this UTC calendar day" })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

@ApiTags("timeline")
@ApiCookieAuth()
@UseGuards(SessionGuard, DietitianGuard, ClientAccessGuard)
@Controller("api/v1/dietitian/:dietitianAccountId/clients/:clientId/timeline")
export class TimelineController {
  constructor(private readonly timeline: TimelineService) {}

  @Get()
  list(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Query() query: TimelineQueryDto,
  ) {
    return this.timeline.list(tenant.dietitianAccountId, clientId, {
      before: query.before,
      date: query.date,
      limit: query.limit,
    });
  }
}
