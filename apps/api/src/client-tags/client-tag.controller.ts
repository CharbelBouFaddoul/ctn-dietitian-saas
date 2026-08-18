import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { IsArray, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";
import { SessionGuard } from "../auth/guards/session.guard";
import { CurrentTenant } from "../organizations/decorators/current-tenant.decorator";
import { TenantGuard } from "../organizations/guards/tenant.guard";
import type { TenantContext } from "../organizations/tenant.types";
import { ClientActionRequired } from "../clients/decorators/client-action.decorator";
import { ClientAccessGuard } from "../clients/guards/client-access.guard";
import { ClientTagService } from "./client-tag.service";

class CreateTagDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(16)
  color?: string;
}

class SetClientTagsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID("4", { each: true })
  tagIds!: string[];
}

@ApiTags("tags")
@ApiCookieAuth()
@UseGuards(SessionGuard, TenantGuard)
@Controller("api/v1/organizations/:organizationId")
export class ClientTagController {
  constructor(private readonly tags: ClientTagService) {}

  @Get("tags")
  list(@CurrentTenant() tenant: TenantContext) {
    return this.tags.listTags(tenant);
  }

  @Post("tags")
  create(@CurrentTenant() tenant: TenantContext, @Body() body: CreateTagDto) {
    return this.tags.createTag(tenant, body.name, body.color);
  }

  @Put("clients/:clientId/tags")
  @UseGuards(ClientAccessGuard)
  @ClientActionRequired("update")
  setClientTags(
    @CurrentTenant() tenant: TenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Body() body: SetClientTagsDto,
  ) {
    return this.tags.setClientTags(tenant, clientId, body.tagIds);
  }
}
