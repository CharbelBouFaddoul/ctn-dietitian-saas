import { Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { SessionGuard } from "../auth/guards/session.guard";
import { CurrentTenant } from "../dietitian/decorators/current-tenant.decorator";
import { DietitianGuard } from "../dietitian/guards/dietitian.guard";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
import { ClientActionRequired } from "../clients/decorators/client-action.decorator";
import { ClientAccessGuard } from "../clients/guards/client-access.guard";
import { ClientAccountService } from "./client-account.service";

@ApiTags("client-accounts")
@ApiCookieAuth()
@UseGuards(SessionGuard, DietitianGuard, ClientAccessGuard)
@Controller("api/v1/dietitian/:dietitianAccountId/clients/:clientId/account")
export class ClientAccountController {
  constructor(private readonly accounts: ClientAccountService) {}

  @Get()
  get(@CurrentTenant() tenant: DietitianTenantContext, @Param("clientId", ParseUUIDPipe) clientId: string) {
    return this.accounts.get(tenant, clientId);
  }

  @Post("invite")
  @HttpCode(HttpStatus.CREATED)
  @ClientActionRequired("invite")
  generateFromInvite(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
  ) {
    return this.accounts.generateJoinCode(tenant, clientId);
  }

  @Post("join-code")
  @HttpCode(HttpStatus.CREATED)
  @ClientActionRequired("invite")
  generate(@CurrentTenant() tenant: DietitianTenantContext, @Param("clientId", ParseUUIDPipe) clientId: string) {
    return this.accounts.generateJoinCode(tenant, clientId);
  }

  @Post("join-code/regenerate")
  @HttpCode(HttpStatus.CREATED)
  @ClientActionRequired("invite")
  regenerate(@CurrentTenant() tenant: DietitianTenantContext, @Param("clientId", ParseUUIDPipe) clientId: string) {
    return this.accounts.generateJoinCode(tenant, clientId);
  }

  @Delete("join-code")
  @HttpCode(HttpStatus.OK)
  @ClientActionRequired("invite")
  revoke(@CurrentTenant() tenant: DietitianTenantContext, @Param("clientId", ParseUUIDPipe) clientId: string) {
    return this.accounts.revokeJoinCode(tenant, clientId);
  }

  @Post("deactivate")
  @ClientActionRequired("invite")
  deactivate(@CurrentTenant() tenant: DietitianTenantContext, @Param("clientId", ParseUUIDPipe) clientId: string) {
    return this.accounts.deactivate(tenant, clientId);
  }
}
