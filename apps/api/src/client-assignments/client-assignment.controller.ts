import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiProperty, ApiTags } from "@nestjs/swagger";
import { IsUUID } from "class-validator";
import { SessionGuard } from "../auth/guards/session.guard";
import { CurrentTenant } from "../dietitian/decorators/current-tenant.decorator";
import { DietitianGuard } from "../dietitian/guards/dietitian.guard";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
import { ClientActionRequired } from "../clients/decorators/client-action.decorator";
import { ClientAccessGuard } from "../clients/guards/client-access.guard";
import { ClientAssignmentService } from "./client-assignment.service";

class AssignClientDto {
  @ApiProperty()
  @IsUUID()
  organizationMemberId!: string;
}

@ApiTags("client-assignments")
@ApiCookieAuth()
@UseGuards(SessionGuard, DietitianGuard, ClientAccessGuard)
@Controller("api/v1/dietitian/:dietitianAccountId/clients/:clientId/assignments")
export class ClientAssignmentController {
  constructor(private readonly assignments: ClientAssignmentService) {}

  @Get()
  list(@CurrentTenant() tenant: DietitianTenantContext, @Param("clientId", ParseUUIDPipe) clientId: string) {
    return this.assignments.list(tenant, clientId);
  }

  @Post()
  @ClientActionRequired("assign")
  assign(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Body() body: AssignClientDto,
  ) {
    return this.assignments.assign(tenant, clientId, body.organizationMemberId);
  }
}
