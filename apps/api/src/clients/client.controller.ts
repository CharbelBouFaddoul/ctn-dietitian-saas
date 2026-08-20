import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { SessionGuard } from "../auth/guards/session.guard";
import { CurrentTenant } from "../dietitian/decorators/current-tenant.decorator";
import { DietitianGuard } from "../dietitian/guards/dietitian.guard";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
import { ClientService } from "./client.service";
import { ClientPortfolioService } from "./client-portfolio.service";
import { ClientActionRequired } from "./decorators/client-action.decorator";
import { CreateClientDto, ListClientsQueryDto, RestoreClientDto, UpdateClientDto } from "./dto/client.dto";
import { ClientAccessGuard } from "./guards/client-access.guard";

@ApiTags("clients")
@ApiCookieAuth()
@UseGuards(SessionGuard, DietitianGuard)
@Controller("api/v1/dietitian/:dietitianAccountId/clients")
export class ClientController {
  constructor(
    private readonly clients: ClientService,
    private readonly portfolio: ClientPortfolioService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List visible clients (server-side filter/pagination)" })
  list(@CurrentTenant() tenant: DietitianTenantContext, @Query() query: ListClientsQueryDto) {
    return this.clients.list(tenant, query);
  }

  @Post()
  @ApiOperation({ summary: "Create a client. Does not create an organization membership." })
  create(@CurrentTenant() tenant: DietitianTenantContext, @Body() body: CreateClientDto) {
    return this.clients.create(tenant, body);
  }

  @Get(":clientId/portfolio")
  @UseGuards(ClientAccessGuard)
  @ApiOperation({ summary: "Read-only client portfolio overview aggregate" })
  getPortfolio(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
  ) {
    return this.portfolio.get(tenant, clientId);
  }

  @Get(":clientId")
  @UseGuards(ClientAccessGuard)
  get(@CurrentTenant() tenant: DietitianTenantContext, @Param("clientId", ParseUUIDPipe) clientId: string) {
    return this.clients.get(tenant, clientId);
  }

  @Patch(":clientId")
  @UseGuards(ClientAccessGuard)
  @ClientActionRequired("update")
  update(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Body() body: UpdateClientDto,
  ) {
    return this.clients.update(tenant, clientId, body);
  }

  @Post(":clientId/archive")
  @UseGuards(ClientAccessGuard)
  @ClientActionRequired("archive")
  archive(@CurrentTenant() tenant: DietitianTenantContext, @Param("clientId", ParseUUIDPipe) clientId: string) {
    return this.clients.archive(tenant, clientId);
  }

  @Post(":clientId/restore")
  @UseGuards(ClientAccessGuard)
  @ClientActionRequired("archive")
  restore(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Body() body: RestoreClientDto,
  ) {
    return this.clients.restore(tenant, clientId, body.status ?? "ACTIVE");
  }
}
