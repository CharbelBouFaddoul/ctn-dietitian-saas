import { Controller, Delete, Get, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { SessionGuard } from "../auth/guards/session.guard";
import { CurrentTenant } from "../dietitian/decorators/current-tenant.decorator";
import { DietitianGuard } from "../dietitian/guards/dietitian.guard";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
import { ClientAccountService } from "./client-account.service";

@ApiTags("practice-join-code")
@ApiCookieAuth()
@UseGuards(SessionGuard, DietitianGuard)
@Controller("api/v1/dietitian/:dietitianAccountId/join-code")
export class PracticeJoinCodeController {
  constructor(private readonly accounts: ClientAccountService) {}

  @Get()
  get(@CurrentTenant() tenant: DietitianTenantContext) {
    return this.accounts.getPracticeJoinCode(tenant);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  generate(@CurrentTenant() tenant: DietitianTenantContext) {
    return this.accounts.generatePracticeJoinCode(tenant);
  }

  @Post("regenerate")
  @HttpCode(HttpStatus.CREATED)
  regenerate(@CurrentTenant() tenant: DietitianTenantContext) {
    return this.accounts.generatePracticeJoinCode(tenant);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  revoke(@CurrentTenant() tenant: DietitianTenantContext) {
    return this.accounts.revokePracticeJoinCode(tenant);
  }
}
