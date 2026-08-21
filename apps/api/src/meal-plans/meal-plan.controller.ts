import {
  Body,
  Controller,
  Delete,
  Get,
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
  CreateMealDto,
  CreateMealItemDto,
  CreateMealPlanDto,
  ListMealPlansQueryDto,
  UpdateDayDto,
  UpdateMealDto,
  UpdateMealItemDto,
  UpdateMealPlanDto,
} from "./dto/meal-plan.dto";
import { MealPlanService } from "./meal-plan.service";

@ApiTags("meal-plans")
@ApiCookieAuth()
@UseGuards(SessionGuard, DietitianGuard)
@Controller("api/v1/dietitian/:dietitianAccountId/meal-plans")
export class MealPlanController {
  constructor(private readonly plans: MealPlanService) {}

  @Get()
  @ApiOperation({ summary: "List meal plans visible to the current member" })
  list(@CurrentTenant() tenant: DietitianTenantContext, @Query() query: ListMealPlansQueryDto) {
    return this.plans.list(tenant, query);
  }

  @Post()
  @ApiOperation({ summary: "Create a meal plan and draft version 1" })
  create(@CurrentTenant() tenant: DietitianTenantContext, @Body() body: CreateMealPlanDto) {
    return this.plans.create(tenant, body.clientId, body);
  }

  @Get(":planId")
  get(@CurrentTenant() tenant: DietitianTenantContext, @Param("planId", ParseUUIDPipe) planId: string) {
    return this.plans.get(tenant, planId);
  }

  @Patch(":planId")
  update(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("planId", ParseUUIDPipe) planId: string,
    @Body() body: UpdateMealPlanDto,
  ) {
    return this.plans.update(tenant, planId, body);
  }

  @Post(":planId/archive")
  archive(@CurrentTenant() tenant: DietitianTenantContext, @Param("planId", ParseUUIDPipe) planId: string) {
    return this.plans.archive(tenant, planId);
  }

  @Post(":planId/versions")
  createDraft(@CurrentTenant() tenant: DietitianTenantContext, @Param("planId", ParseUUIDPipe) planId: string) {
    return this.plans.createDraftVersion(tenant, planId);
  }

  @Get(":planId/versions/:versionId")
  getVersion(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("planId", ParseUUIDPipe) planId: string,
    @Param("versionId", ParseUUIDPipe) versionId: string,
  ) {
    return this.plans.getVersion(tenant, planId, versionId);
  }

  @Post(":planId/versions/:versionId/publish")
  publish(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("planId", ParseUUIDPipe) planId: string,
    @Param("versionId", ParseUUIDPipe) versionId: string,
  ) {
    return this.plans.publish(tenant, planId, versionId);
  }

  @Post(":planId/versions/:versionId/weeks")
  @ApiOperation({ summary: "Append 7 days (one presentation week) to a draft version" })
  addWeek(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("planId", ParseUUIDPipe) planId: string,
    @Param("versionId", ParseUUIDPipe) versionId: string,
  ) {
    return this.plans.addWeek(tenant, planId, versionId);
  }

  @Post(":planId/versions/:versionId/days")
  addDay(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("planId", ParseUUIDPipe) planId: string,
    @Param("versionId", ParseUUIDPipe) versionId: string,
    @Body() body: UpdateDayDto,
  ) {
    return this.plans.addDay(tenant, planId, versionId, body);
  }

  @Patch(":planId/versions/:versionId/days/:dayId")
  updateDay(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("planId", ParseUUIDPipe) planId: string,
    @Param("versionId", ParseUUIDPipe) versionId: string,
    @Param("dayId", ParseUUIDPipe) dayId: string,
    @Body() body: UpdateDayDto,
  ) {
    return this.plans.updateDay(tenant, planId, versionId, dayId, body);
  }

  @Delete(":planId/versions/:versionId/days/:dayId")
  deleteDay(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("planId", ParseUUIDPipe) planId: string,
    @Param("versionId", ParseUUIDPipe) versionId: string,
    @Param("dayId", ParseUUIDPipe) dayId: string,
  ) {
    return this.plans.deleteDay(tenant, planId, versionId, dayId);
  }

  @Post(":planId/versions/:versionId/days/:dayId/meals")
  addMeal(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("planId", ParseUUIDPipe) planId: string,
    @Param("versionId", ParseUUIDPipe) versionId: string,
    @Param("dayId", ParseUUIDPipe) dayId: string,
    @Body() body: CreateMealDto,
  ) {
    return this.plans.addMeal(tenant, planId, versionId, dayId, body);
  }

  @Patch(":planId/versions/:versionId/meals/:mealId")
  updateMeal(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("planId", ParseUUIDPipe) planId: string,
    @Param("versionId", ParseUUIDPipe) versionId: string,
    @Param("mealId", ParseUUIDPipe) mealId: string,
    @Body() body: UpdateMealDto,
  ) {
    return this.plans.updateMeal(tenant, planId, versionId, mealId, body);
  }

  @Delete(":planId/versions/:versionId/meals/:mealId")
  deleteMeal(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("planId", ParseUUIDPipe) planId: string,
    @Param("versionId", ParseUUIDPipe) versionId: string,
    @Param("mealId", ParseUUIDPipe) mealId: string,
  ) {
    return this.plans.deleteMeal(tenant, planId, versionId, mealId);
  }

  @Post(":planId/versions/:versionId/meals/:mealId/items")
  addItem(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("planId", ParseUUIDPipe) planId: string,
    @Param("versionId", ParseUUIDPipe) versionId: string,
    @Param("mealId", ParseUUIDPipe) mealId: string,
    @Body() body: CreateMealItemDto,
  ) {
    return this.plans.addItem(tenant, planId, versionId, mealId, body);
  }

  @Patch(":planId/versions/:versionId/items/:itemId")
  updateItem(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("planId", ParseUUIDPipe) planId: string,
    @Param("versionId", ParseUUIDPipe) versionId: string,
    @Param("itemId", ParseUUIDPipe) itemId: string,
    @Body() body: UpdateMealItemDto,
  ) {
    return this.plans.updateItem(tenant, planId, versionId, itemId, body);
  }

  @Delete(":planId/versions/:versionId/items/:itemId")
  deleteItem(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("planId", ParseUUIDPipe) planId: string,
    @Param("versionId", ParseUUIDPipe) versionId: string,
    @Param("itemId", ParseUUIDPipe) itemId: string,
  ) {
    return this.plans.deleteItem(tenant, planId, versionId, itemId);
  }
}
