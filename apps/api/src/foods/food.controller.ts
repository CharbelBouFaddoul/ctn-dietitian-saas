import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { SessionGuard } from "../auth/guards/session.guard";
import { CurrentTenant } from "../dietitian/decorators/current-tenant.decorator";
import { DietitianGuard } from "../dietitian/guards/dietitian.guard";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
import {
  CalculateFoodDto,
  CreateCustomFoodDto,
  ListFoodsQueryDto,
  UpdateCustomFoodDto,
} from "./dto/food.dto";
import { FoodService } from "./food.service";

@ApiTags("foods")
@ApiCookieAuth()
@UseGuards(SessionGuard, DietitianGuard)
@Controller("api/v1/dietitian/:dietitianAccountId/foods")
export class FoodController {
  constructor(private readonly foods: FoodService) {}

  @Get()
  @ApiOperation({ summary: "Search catalog + practice custom foods (server-side pagination and filters)" })
  search(@CurrentTenant() tenant: DietitianTenantContext, @Query() query: ListFoodsQueryDto) {
    return this.foods.search(tenant.dietitianAccountId, query);
  }

  @Get("categories")
  @ApiOperation({ summary: "List distinct food categories from catalog + own custom foods" })
  categories(@CurrentTenant() tenant: DietitianTenantContext) {
    return this.foods.listCategories(tenant.dietitianAccountId);
  }

  @Post()
  @ApiOperation({ summary: "Create a practice-private custom food" })
  create(@CurrentTenant() tenant: DietitianTenantContext, @Body() body: CreateCustomFoodDto) {
    return this.foods.createCustom(tenant.dietitianAccountId, tenant.userId, body);
  }

  @Get(":foodId")
  @ApiOperation({
    summary: "Get effective food for this practice",
    description:
      "Catalog foods merge FoodOverride. Custom foods return own nutrients. Other practices' customs are not visible.",
  })
  getEffective(@CurrentTenant() tenant: DietitianTenantContext, @Param("foodId", ParseUUIDPipe) foodId: string) {
    return this.foods.getEffective(tenant.dietitianAccountId, foodId);
  }

  @Patch(":foodId")
  @ApiOperation({ summary: "Update a practice-private custom food (global foods rejected)" })
  update(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("foodId", ParseUUIDPipe) foodId: string,
    @Body() body: UpdateCustomFoodDto,
  ) {
    return this.foods.updateCustom(tenant.dietitianAccountId, foodId, body);
  }

  @Post(":foodId/archive")
  @ApiOperation({ summary: "Soft-archive a practice-private custom food" })
  archive(@CurrentTenant() tenant: DietitianTenantContext, @Param("foodId", ParseUUIDPipe) foodId: string) {
    return this.foods.archiveCustom(tenant.dietitianAccountId, foodId);
  }

  @Post(":foodId/calculate")
  @HttpCode(200)
  @ApiOperation({ summary: "Calculate nutrition for a quantity using effective values and the shared engine" })
  calculate(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("foodId", ParseUUIDPipe) foodId: string,
    @Body() body: CalculateFoodDto,
  ) {
    return this.foods.calculate(tenant.dietitianAccountId, foodId, body.quantity, body.unit);
  }
}
