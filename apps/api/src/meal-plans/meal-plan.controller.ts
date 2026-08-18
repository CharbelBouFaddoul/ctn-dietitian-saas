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
import { CurrentTenant } from "../organizations/decorators/current-tenant.decorator";
import { TenantGuard } from "../organizations/guards/tenant.guard";
import type { TenantContext } from "../organizations/tenant.types";
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
@UseGuards(SessionGuard, TenantGuard)
@Controller("api/v1/organizations/:organizationId/meal-plans")
export class MealPlanController {
  constructor(private readonly plans: MealPlanService) {}

  @Get()
  @ApiOperation({ summary: "List meal plans visible to the current member" })
  list(@CurrentTenant() tenant: TenantContext, @Query() query: ListMealPlansQueryDto) {
    return this.plans.list(tenant, query);
  }

  @Post()
  @ApiOperation({ summary: "Create a meal plan and draft version 1" })
  create(@CurrentTenant() tenant: TenantContext, @Body() body: CreateMealPlanDto) {
    return this.plans.create(tenant, body.clientId, body);
  }

  @Get(":planId")
  get(@CurrentTenant() tenant: TenantContext, @Param("planId", ParseUUIDPipe) planId: string) {
    return this.plans.get(tenant, planId);
  }

  @Patch(":planId")
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param("planId", ParseUUIDPipe) planId: string,
    @Body() body: UpdateMealPlanDto,
  ) {
    return this.plans.update(tenant, planId, body);
  }

  @Post(":planId/archive")
  archive(@CurrentTenant() tenant: TenantContext, @Param("planId", ParseUUIDPipe) planId: string) {
    return this.plans.archive(tenant, planId);
  }

  @Post(":planId/versions")
  createDraft(@CurrentTenant() tenant: TenantContext, @Param("planId", ParseUUIDPipe) planId: string) {
    return this.plans.createDraftVersion(tenant, planId);
  }

  @Get(":planId/versions/:versionId")
  getVersion(
    @CurrentTenant() tenant: TenantContext,
    @Param("planId", ParseUUIDPipe) planId: string,
    @Param("versionId", ParseUUIDPipe) versionId: string,
  ) {
    return this.plans.getVersion(tenant, planId, versionId);
  }

  @Post(":planId/versions/:versionId/publish")
  publish(
    @CurrentTenant() tenant: TenantContext,
    @Param("planId", ParseUUIDPipe) planId: string,
    @Param("versionId", ParseUUIDPipe) versionId: string,
  ) {
    return this.plans.publish(tenant, planId, versionId);
  }

  @Post(":planId/versions/:versionId/days")
  addDay(
    @CurrentTenant() tenant: TenantContext,
    @Param("planId", ParseUUIDPipe) planId: string,
    @Param("versionId", ParseUUIDPipe) versionId: string,
    @Body() body: UpdateDayDto,
  ) {
    return this.plans.addDay(tenant, planId, versionId, body);
  }

  @Patch(":planId/versions/:versionId/days/:dayId")
  updateDay(
    @CurrentTenant() tenant: TenantContext,
    @Param("planId", ParseUUIDPipe) planId: string,
    @Param("versionId", ParseUUIDPipe) versionId: string,
    @Param("dayId", ParseUUIDPipe) dayId: string,
    @Body() body: UpdateDayDto,
  ) {
    return this.plans.updateDay(tenant, planId, versionId, dayId, body);
  }

  @Delete(":planId/versions/:versionId/days/:dayId")
  deleteDay(
    @CurrentTenant() tenant: TenantContext,
    @Param("planId", ParseUUIDPipe) planId: string,
    @Param("versionId", ParseUUIDPipe) versionId: string,
    @Param("dayId", ParseUUIDPipe) dayId: string,
  ) {
    return this.plans.deleteDay(tenant, planId, versionId, dayId);
  }

  @Post(":planId/versions/:versionId/days/:dayId/meals")
  addMeal(
    @CurrentTenant() tenant: TenantContext,
    @Param("planId", ParseUUIDPipe) planId: string,
    @Param("versionId", ParseUUIDPipe) versionId: string,
    @Param("dayId", ParseUUIDPipe) dayId: string,
    @Body() body: CreateMealDto,
  ) {
    return this.plans.addMeal(tenant, planId, versionId, dayId, body);
  }

  @Patch(":planId/versions/:versionId/meals/:mealId")
  updateMeal(
    @CurrentTenant() tenant: TenantContext,
    @Param("planId", ParseUUIDPipe) planId: string,
    @Param("versionId", ParseUUIDPipe) versionId: string,
    @Param("mealId", ParseUUIDPipe) mealId: string,
    @Body() body: UpdateMealDto,
  ) {
    return this.plans.updateMeal(tenant, planId, versionId, mealId, body);
  }

  @Delete(":planId/versions/:versionId/meals/:mealId")
  deleteMeal(
    @CurrentTenant() tenant: TenantContext,
    @Param("planId", ParseUUIDPipe) planId: string,
    @Param("versionId", ParseUUIDPipe) versionId: string,
    @Param("mealId", ParseUUIDPipe) mealId: string,
  ) {
    return this.plans.deleteMeal(tenant, planId, versionId, mealId);
  }

  @Post(":planId/versions/:versionId/meals/:mealId/items")
  addItem(
    @CurrentTenant() tenant: TenantContext,
    @Param("planId", ParseUUIDPipe) planId: string,
    @Param("versionId", ParseUUIDPipe) versionId: string,
    @Param("mealId", ParseUUIDPipe) mealId: string,
    @Body() body: CreateMealItemDto,
  ) {
    return this.plans.addItem(tenant, planId, versionId, mealId, body);
  }

  @Patch(":planId/versions/:versionId/items/:itemId")
  updateItem(
    @CurrentTenant() tenant: TenantContext,
    @Param("planId", ParseUUIDPipe) planId: string,
    @Param("versionId", ParseUUIDPipe) versionId: string,
    @Param("itemId", ParseUUIDPipe) itemId: string,
    @Body() body: UpdateMealItemDto,
  ) {
    return this.plans.updateItem(tenant, planId, versionId, itemId, body);
  }

  @Delete(":planId/versions/:versionId/items/:itemId")
  deleteItem(
    @CurrentTenant() tenant: TenantContext,
    @Param("planId", ParseUUIDPipe) planId: string,
    @Param("versionId", ParseUUIDPipe) versionId: string,
    @Param("itemId", ParseUUIDPipe) itemId: string,
  ) {
    return this.plans.deleteItem(tenant, planId, versionId, itemId);
  }
}
