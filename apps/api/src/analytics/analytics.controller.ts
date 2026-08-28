import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { SessionGuard } from "../auth/guards/session.guard";
import { CurrentTenant } from "../dietitian/decorators/current-tenant.decorator";
import { DietitianGuard } from "../dietitian/guards/dietitian.guard";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
import type { AnalyticsPeriod } from "./analytics-range";
import { AnalyticsService } from "./analytics.service";

@ApiTags("analytics")
@ApiCookieAuth()
@UseGuards(SessionGuard, DietitianGuard)
@Controller("api/v1/dietitian/:dietitianAccountId/analytics")
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get("overview")
  overview(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Query("period") period?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    return this.analytics.overview(tenant, { period: period as AnalyticsPeriod | undefined, startDate, endDate });
  }

  @Get("clients")
  clients(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Query("period") period?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    return this.analytics.clients(tenant, { period: period as AnalyticsPeriod | undefined, startDate, endDate });
  }

  @Get("activity")
  activity(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Query("period") period?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    return this.analytics.activity(tenant, { period: period as AnalyticsPeriod | undefined, startDate, endDate });
  }

  @Get("financial")
  financial(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Query("period") period?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    return this.analytics.financial(tenant, { period: period as AnalyticsPeriod | undefined, startDate, endDate });
  }

  @Get("series")
  series(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Query("period") period?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    return this.analytics.series(tenant, { period: period as AnalyticsPeriod | undefined, startDate, endDate });
  }
}
