import { Body, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Put, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { SessionGuard } from "../auth/guards/session.guard";
import { CurrentTenant } from "../organizations/decorators/current-tenant.decorator";
import { TenantGuard } from "../organizations/guards/tenant.guard";
import type { TenantContext } from "../organizations/tenant.types";
import { FoodService } from "../foods/food.service";
import { UpsertFoodOverrideDto } from "../foods/dto/food.dto";
import { FoodOverrideService } from "./food-override.service";

@ApiTags("foods")
@ApiCookieAuth()
@UseGuards(SessionGuard, TenantGuard)
@Controller("api/v1/organizations/:organizationId/foods/:foodId/override")
export class FoodOverrideController {
  constructor(
    private readonly overrides: FoodOverrideService,
    private readonly foods: FoodService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Inspect this organization's override for a food" })
  async get(@CurrentTenant() tenant: TenantContext, @Param("foodId", ParseUUIDPipe) foodId: string) {
    const effective = await this.foods.getEffective(tenant.organizationId, foodId);
    if (!effective.override) {
      throw new NotFoundException("Override not found");
    }
    return effective;
  }

  @Put()
  @ApiOperation({
    summary: "Create or update an organization food override",
    description: "Never mutates the global foods row. Null fields clear that nutrient override.",
  })
  upsert(
    @CurrentTenant() tenant: TenantContext,
    @Param("foodId", ParseUUIDPipe) foodId: string,
    @Body() body: UpsertFoodOverrideDto,
  ) {
    return this.overrides.upsert(tenant, foodId, body);
  }

  @Delete()
  @ApiOperation({ summary: "Deactivate this organization's override and restore global effective values" })
  remove(@CurrentTenant() tenant: TenantContext, @Param("foodId", ParseUUIDPipe) foodId: string) {
    return this.overrides.remove(tenant, foodId);
  }
}
