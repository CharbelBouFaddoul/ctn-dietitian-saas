import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { SessionGuard } from "../auth/guards/session.guard";
import { CurrentTenant } from "../dietitian/decorators/current-tenant.decorator";
import { DietitianGuard } from "../dietitian/guards/dietitian.guard";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
import { ClientActionRequired } from "../clients/decorators/client-action.decorator";
import { ClientAccessGuard } from "../clients/guards/client-access.guard";
import { ClientProfileService } from "./client-profile.service";

class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  nutritionContext?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  preferences?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  dietaryPreferences?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  allergies?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  intolerances?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  lifestyle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  emergencyContactName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  emergencyContactPhone?: string;
}

@ApiTags("client-profiles")
@ApiCookieAuth()
@UseGuards(SessionGuard, DietitianGuard, ClientAccessGuard)
@Controller("api/v1/dietitian/:dietitianAccountId/clients/:clientId/profile")
export class ClientProfileController {
  constructor(private readonly profiles: ClientProfileService) {}

  @Get()
  get(@CurrentTenant() tenant: DietitianTenantContext, @Param("clientId", ParseUUIDPipe) clientId: string) {
    return this.profiles.get(tenant, clientId);
  }

  @Patch()
  @ClientActionRequired("update")
  update(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Body() body: UpdateProfileDto,
  ) {
    return this.profiles.update(tenant, clientId, body);
  }
}
