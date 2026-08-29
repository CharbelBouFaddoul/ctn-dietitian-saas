import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionGuard } from "../auth/guards/session.guard";
import type { AuthenticatedRequestUser } from "../auth/auth.types";
import { AiService } from "../ai/ai.service";
import { AutomationService } from "../automation/automation.service";
import { adminActor } from "./admin-actor";
import { AdminDietitianAccountService } from "./admin-dietitian-account.service";
import { AdminOverrideService } from "./admin-override.service";
import { AdminSubscriptionService } from "./admin-subscription.service";
import {
  AdminSearchQueryDto,
  AssignSubscriptionDto,
  RenewSubscriptionDto,
  UpdateDietitianAccountStatusDto,
  UpdateSubscriptionStatusDto,
  UpsertFeatureOverrideDto,
} from "./dto/admin.dto";
import { PlatformRolesGuard } from "./guards/platform-roles.guard";

@ApiTags("admin")
@ApiCookieAuth()
@UseGuards(SessionGuard, PlatformRolesGuard)
@Controller("api/v1/admin/dietitians")
export class AdminDietitiansManageController {
  constructor(
    private readonly dietitians: AdminDietitianAccountService,
    private readonly subscriptions: AdminSubscriptionService,
    private readonly overrides: AdminOverrideService,
    private readonly ai: AiService,
    private readonly automation: AutomationService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List dietitian accounts" })
  list(@Query() query: AdminSearchQueryDto) {
    return this.dietitians.list(query.q);
  }

  @Get(":dietitianAccountId")
  @ApiOperation({ summary: "Get dietitian account, subscription, and effective entitlements" })
  get(@Param("dietitianAccountId", ParseUUIDPipe) dietitianAccountId: string) {
    return this.dietitians.get(dietitianAccountId);
  }

  @Get(":dietitianAccountId/ai/usage")
  @ApiOperation({ summary: "Inspect dietitian AI usage and entitlement" })
  aiUsage(
    @Param("dietitianAccountId", ParseUUIDPipe) dietitianAccountId: string,
    @Query("period") period?: string,
  ) {
    return this.ai.getUsageSummary(dietitianAccountId, period);
  }

  @Get(":dietitianAccountId/automation/summary")
  @ApiOperation({ summary: "Inspect dietitian automation health" })
  automationSummary(@Param("dietitianAccountId", ParseUUIDPipe) dietitianAccountId: string) {
    return this.automation.getAdminSummary(dietitianAccountId);
  }

  @Patch(":dietitianAccountId/status")
  @ApiOperation({ summary: "Activate, suspend, or archive a dietitian account" })
  setStatus(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Req() req: Request,
    @Param("dietitianAccountId", ParseUUIDPipe) dietitianAccountId: string,
    @Body() body: UpdateDietitianAccountStatusDto,
  ) {
    return this.dietitians.setStatus(dietitianAccountId, body.status, adminActor(user, req));
  }

  @Get(":dietitianAccountId/entitlements")
  @ApiOperation({ summary: "Effective entitlements for a dietitian account" })
  entitlements(@Param("dietitianAccountId", ParseUUIDPipe) dietitianAccountId: string) {
    return this.dietitians.entitlementsFor(dietitianAccountId);
  }

  @Get(":dietitianAccountId/subscription")
  @ApiOperation({ summary: "Get the dietitian account subscription" })
  getSubscription(@Param("dietitianAccountId", ParseUUIDPipe) dietitianAccountId: string) {
    return this.subscriptions.getForDietitianAccount(dietitianAccountId);
  }

  @Put(":dietitianAccountId/subscription")
  @ApiOperation({ summary: "Assign or change the dietitian account plan" })
  assign(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Req() req: Request,
    @Param("dietitianAccountId", ParseUUIDPipe) dietitianAccountId: string,
    @Body() body: AssignSubscriptionDto,
  ) {
    return this.subscriptions.assign(dietitianAccountId, body, adminActor(user, req));
  }

  @Post(":dietitianAccountId/subscription/renew")
  @HttpCode(200)
  @ApiOperation({ summary: "Renew or reactivate subscription (ACTIVE + new period)" })
  renew(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Req() req: Request,
    @Param("dietitianAccountId", ParseUUIDPipe) dietitianAccountId: string,
    @Body() body: RenewSubscriptionDto,
  ) {
    return this.subscriptions.renew(dietitianAccountId, body, adminActor(user, req));
  }

  @Patch(":dietitianAccountId/subscription")
  @ApiOperation({ summary: "Change subscription lifecycle status" })
  setSubscriptionStatus(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Req() req: Request,
    @Param("dietitianAccountId", ParseUUIDPipe) dietitianAccountId: string,
    @Body() body: UpdateSubscriptionStatusDto,
  ) {
    return this.subscriptions.setStatus(dietitianAccountId, body.status, adminActor(user, req));
  }

  @Put(":dietitianAccountId/overrides/:featureKey")
  @ApiOperation({ summary: "Create or update a feature override" })
  upsertOverride(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Req() req: Request,
    @Param("dietitianAccountId", ParseUUIDPipe) dietitianAccountId: string,
    @Param("featureKey") featureKey: string,
    @Body() body: UpsertFeatureOverrideDto,
  ) {
    return this.overrides.upsert(dietitianAccountId, featureKey, body, adminActor(user, req));
  }

  @Delete(":dietitianAccountId/overrides/:featureKey")
  @HttpCode(200)
  @ApiOperation({ summary: "Remove a feature override" })
  removeOverride(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Req() req: Request,
    @Param("dietitianAccountId", ParseUUIDPipe) dietitianAccountId: string,
    @Param("featureKey") featureKey: string,
  ) {
    return this.overrides.remove(dietitianAccountId, featureKey, adminActor(user, req));
  }
}
