import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsDateString, IsInt, IsOptional, Max, Min } from "class-validator";
import { SessionGuard } from "../auth/guards/session.guard";
import { CurrentTenant } from "../organizations/decorators/current-tenant.decorator";
import { TenantGuard } from "../organizations/guards/tenant.guard";
import type { TenantContext } from "../organizations/tenant.types";
import { ClientAccessGuard } from "../clients/guards/client-access.guard";
import { TimelineService } from "./timeline.service";

class TimelineQueryDto {
  @ApiPropertyOptional({ description: "ISO timestamp — return events strictly before this time" })
  @IsOptional()
  @IsDateString()
  before?: string;

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
@UseGuards(SessionGuard, TenantGuard, ClientAccessGuard)
@Controller("api/v1/organizations/:organizationId/clients/:clientId/timeline")
export class TimelineController {
  constructor(private readonly timeline: TimelineService) {}

  @Get()
  list(
    @CurrentTenant() tenant: TenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Query() query: TimelineQueryDto,
  ) {
    return this.timeline.list(tenant.organizationId, clientId, {
      before: query.before,
      limit: query.limit,
    });
  }
}
