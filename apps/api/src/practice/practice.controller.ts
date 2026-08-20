import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { SessionGuard } from "../auth/guards/session.guard";
import { CurrentTenant } from "../dietitian/decorators/current-tenant.decorator";
import { DietitianGuard } from "../dietitian/guards/dietitian.guard";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
import { PracticeDashboardService } from "./practice-dashboard.service";

@ApiTags("practice")
@ApiCookieAuth()
@UseGuards(SessionGuard, DietitianGuard)
@Controller("api/v1/dietitian/:dietitianAccountId/practice")
export class PracticeController {
  constructor(private readonly dashboard: PracticeDashboardService) {}

  @Get("dashboard")
  get(@CurrentTenant() tenant: DietitianTenantContext) {
    return this.dashboard.get(tenant);
  }
}
