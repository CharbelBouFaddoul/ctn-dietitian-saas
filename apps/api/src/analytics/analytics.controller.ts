import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { SessionGuard } from "../auth/guards/session.guard";
import { CurrentTenant } from "../organizations/decorators/current-tenant.decorator";
import { TenantGuard } from "../organizations/guards/tenant.guard";
import type { TenantContext } from "../organizations/tenant.types";
import type { AnalyticsPeriod } from "./analytics-range";
import { AnalyticsService } from "./analytics.service";

@ApiTags("analytics")
@ApiCookieAuth()
@UseGuards(SessionGuard, TenantGuard)
@Controller("api/v1/organizations/:organizationId/analytics")
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get("overview")
  overview(
    @CurrentTenant() tenant: TenantContext,
    @Query("period") period?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    return this.analytics.overview(tenant, { period: period as AnalyticsPeriod | undefined, startDate, endDate });
  }

  @Get("clients")
  clients(
    @CurrentTenant() tenant: TenantContext,
    @Query("period") period?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    return this.analytics.clients(tenant, { period: period as AnalyticsPeriod | undefined, startDate, endDate });
  }

  @Get("activity")
  activity(
    @CurrentTenant() tenant: TenantContext,
    @Query("period") period?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    return this.analytics.activity(tenant, { period: period as AnalyticsPeriod | undefined, startDate, endDate });
  }

  @Get("financial")
  financial(
    @CurrentTenant() tenant: TenantContext,
    @Query("period") period?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    return this.analytics.financial(tenant, { period: period as AnalyticsPeriod | undefined, startDate, endDate });
  }
}
