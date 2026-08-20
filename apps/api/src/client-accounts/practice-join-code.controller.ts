import { Controller, Delete, Get, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { SessionGuard } from "../auth/guards/session.guard";
import { CurrentTenant } from "../organizations/decorators/current-tenant.decorator";
import { TenantGuard } from "../organizations/guards/tenant.guard";
import type { TenantContext } from "../organizations/tenant.types";
import { ClientAccountService } from "./client-account.service";

@ApiTags("practice-join-code")
@ApiCookieAuth()
@UseGuards(SessionGuard, TenantGuard)
@Controller("api/v1/organizations/:organizationId/join-code")
export class PracticeJoinCodeController {
  constructor(private readonly accounts: ClientAccountService) {}

  @Get()
  get(@CurrentTenant() tenant: TenantContext) {
    return this.accounts.getPracticeJoinCode(tenant);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  generate(@CurrentTenant() tenant: TenantContext) {
    return this.accounts.generatePracticeJoinCode(tenant);
  }

  @Post("regenerate")
  @HttpCode(HttpStatus.CREATED)
  regenerate(@CurrentTenant() tenant: TenantContext) {
    return this.accounts.generatePracticeJoinCode(tenant);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  revoke(@CurrentTenant() tenant: TenantContext) {
    return this.accounts.revokePracticeJoinCode(tenant);
  }
}
