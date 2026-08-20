import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { SessionGuard } from "../auth/guards/session.guard";
import { CurrentTenant } from "../organizations/decorators/current-tenant.decorator";
import { TenantGuard } from "../organizations/guards/tenant.guard";
import type { TenantContext } from "../organizations/tenant.types";
import { ClientService } from "./client.service";
import { ClientPortfolioService } from "./client-portfolio.service";
import { ClientActionRequired } from "./decorators/client-action.decorator";
import { CreateClientDto, ListClientsQueryDto, RestoreClientDto, UpdateClientDto } from "./dto/client.dto";
import { ClientAccessGuard } from "./guards/client-access.guard";

@ApiTags("clients")
@ApiCookieAuth()
@UseGuards(SessionGuard, TenantGuard)
@Controller("api/v1/organizations/:organizationId/clients")
export class ClientController {
  constructor(
    private readonly clients: ClientService,
    private readonly portfolio: ClientPortfolioService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List visible clients (server-side filter/pagination)" })
  list(@CurrentTenant() tenant: TenantContext, @Query() query: ListClientsQueryDto) {
    return this.clients.list(tenant, query);
  }

  @Post()
  @ApiOperation({ summary: "Create a client. Does not create an organization membership." })
  create(@CurrentTenant() tenant: TenantContext, @Body() body: CreateClientDto) {
    return this.clients.create(tenant, body);
  }

  @Get(":clientId/portfolio")
  @UseGuards(ClientAccessGuard)
  @ApiOperation({ summary: "Read-only client portfolio overview aggregate" })
  getPortfolio(
    @CurrentTenant() tenant: TenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
  ) {
    return this.portfolio.get(tenant, clientId);
  }

  @Get(":clientId")
  @UseGuards(ClientAccessGuard)
  get(@CurrentTenant() tenant: TenantContext, @Param("clientId", ParseUUIDPipe) clientId: string) {
    return this.clients.get(tenant, clientId);
  }

  @Patch(":clientId")
  @UseGuards(ClientAccessGuard)
  @ClientActionRequired("update")
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Body() body: UpdateClientDto,
  ) {
    return this.clients.update(tenant, clientId, body);
  }

  @Post(":clientId/archive")
  @UseGuards(ClientAccessGuard)
  @ClientActionRequired("archive")
  archive(@CurrentTenant() tenant: TenantContext, @Param("clientId", ParseUUIDPipe) clientId: string) {
    return this.clients.archive(tenant, clientId);
  }

  @Post(":clientId/restore")
  @UseGuards(ClientAccessGuard)
  @ClientActionRequired("archive")
  restore(
    @CurrentTenant() tenant: TenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Body() body: RestoreClientDto,
  ) {
    return this.clients.restore(tenant, clientId, body.status ?? "ACTIVE");
  }
}
