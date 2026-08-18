import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Req, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionGuard } from "../auth/guards/session.guard";
import type { AuthenticatedRequestUser } from "../auth/auth.types";
import { adminActor } from "./admin-actor";
import { AdminCatalogService } from "./admin-catalog.service";
import {
  CreateFeatureDto,
  CreatePlanDto,
  ReplacePlanFeaturesDto,
  UpdateFeatureDto,
  UpdatePlanDto,
} from "./dto/admin.dto";
import { PlatformRolesGuard } from "./guards/platform-roles.guard";

@ApiTags("admin")
@ApiCookieAuth()
@UseGuards(SessionGuard, PlatformRolesGuard)
@Controller("api/v1/admin")
export class AdminCatalogController {
  constructor(private readonly catalog: AdminCatalogService) {}

  @Get("plans")
  @ApiOperation({ summary: "List subscription plans" })
  listPlans() {
    return this.catalog.listPlans();
  }

  @Post("plans")
  @ApiOperation({ summary: "Create a subscription plan" })
  createPlan(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Req() req: Request,
    @Body() body: CreatePlanDto,
  ) {
    return this.catalog.createPlan(body, adminActor(user, req));
  }

  @Get("plans/:planId")
  @ApiOperation({ summary: "Get a plan and its features" })
  getPlan(@Param("planId", ParseUUIDPipe) planId: string) {
    return this.catalog.getPlan(planId);
  }

  @Patch("plans/:planId")
  @ApiOperation({ summary: "Update plan name, description, or status. Referenced plans are not deleted." })
  updatePlan(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Req() req: Request,
    @Param("planId", ParseUUIDPipe) planId: string,
    @Body() body: UpdatePlanDto,
  ) {
    return this.catalog.updatePlan(planId, body, adminActor(user, req));
  }

  @Put("plans/:planId/features")
  @ApiOperation({ summary: "Replace plan feature configuration" })
  replacePlanFeatures(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Req() req: Request,
    @Param("planId", ParseUUIDPipe) planId: string,
    @Body() body: ReplacePlanFeaturesDto,
  ) {
    return this.catalog.replacePlanFeatures(planId, body.features, adminActor(user, req));
  }

  @Get("features")
  @ApiOperation({ summary: "List feature catalog" })
  listFeatures() {
    return this.catalog.listFeatures();
  }

  @Post("features")
  @ApiOperation({ summary: "Create a feature definition" })
  createFeature(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Req() req: Request,
    @Body() body: CreateFeatureDto,
  ) {
    return this.catalog.createFeature(body, adminActor(user, req));
  }

  @Patch("features/:featureId")
  @ApiOperation({
    summary: "Update a feature",
    description:
      "Global feature status is separate from organization entitlement. Inactive catalog features deny through EntitlementService; they do not bypass subscription checks.",
  })
  updateFeature(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Req() req: Request,
    @Param("featureId", ParseUUIDPipe) featureId: string,
    @Body() body: UpdateFeatureDto,
  ) {
    return this.catalog.updateFeature(featureId, body, adminActor(user, req));
  }
}
