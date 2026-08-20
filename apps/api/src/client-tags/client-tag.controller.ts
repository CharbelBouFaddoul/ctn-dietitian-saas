import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { IsArray, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";
import { SessionGuard } from "../auth/guards/session.guard";
import { CurrentTenant } from "../dietitian/decorators/current-tenant.decorator";
import { DietitianGuard } from "../dietitian/guards/dietitian.guard";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
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
@UseGuards(SessionGuard, DietitianGuard)
@Controller("api/v1/dietitian/:dietitianAccountId")
export class ClientTagController {
  constructor(private readonly tags: ClientTagService) {}

  @Get("tags")
  list(@CurrentTenant() tenant: DietitianTenantContext) {
    return this.tags.listTags(tenant);
  }

  @Post("tags")
  create(@CurrentTenant() tenant: DietitianTenantContext, @Body() body: CreateTagDto) {
    return this.tags.createTag(tenant, body.name, body.color);
  }

  @Put("clients/:clientId/tags")
  @UseGuards(ClientAccessGuard)
  @ClientActionRequired("update")
  setClientTags(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Body() body: SetClientTagsDto,
  ) {
    return this.tags.setClientTags(tenant, clientId, body.tagIds);
  }
}
