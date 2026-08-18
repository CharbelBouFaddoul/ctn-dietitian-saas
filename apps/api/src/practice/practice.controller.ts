import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { SessionGuard } from "../auth/guards/session.guard";
import { CurrentTenant } from "../organizations/decorators/current-tenant.decorator";
import { TenantGuard } from "../organizations/guards/tenant.guard";
import type { TenantContext } from "../organizations/tenant.types";
import { PracticeDashboardService } from "./practice-dashboard.service";

@ApiTags("practice")
@ApiCookieAuth()
@UseGuards(SessionGuard, TenantGuard)
@Controller("api/v1/organizations/:organizationId/practice")
export class PracticeController {
  constructor(private readonly dashboard: PracticeDashboardService) {}

  @Get("dashboard")
  get(@CurrentTenant() tenant: TenantContext) {
    return this.dashboard.get(tenant);
  }
}
