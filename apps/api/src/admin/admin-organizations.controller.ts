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
import { AdminOrganizationService } from "./admin-organization.service";
import { AdminOverrideService } from "./admin-override.service";
import { AdminSubscriptionService } from "./admin-subscription.service";
import {
  AdminSearchQueryDto,
  AssignSubscriptionDto,
  RenewSubscriptionDto,
  UpdateOrganizationStatusDto,
  UpdateSubscriptionStatusDto,
  UpsertFeatureOverrideDto,
} from "./dto/admin.dto";
import { PlatformRolesGuard } from "./guards/platform-roles.guard";

@ApiTags("admin")
@ApiCookieAuth()
@UseGuards(SessionGuard, PlatformRolesGuard)
@Controller("api/v1/admin/organizations")
export class AdminOrganizationsController {
  constructor(
    private readonly organizations: AdminOrganizationService,
    private readonly subscriptions: AdminSubscriptionService,
    private readonly overrides: AdminOverrideService,
    private readonly ai: AiService,
    private readonly automation: AutomationService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List organizations" })
  list(@Query() query: AdminSearchQueryDto) {
    return this.organizations.list(query.q);
  }

  @Get(":organizationId")
  @ApiOperation({ summary: "Get organization, subscription, and effective entitlements" })
  get(@Param("organizationId", ParseUUIDPipe) organizationId: string) {
    return this.organizations.get(organizationId);
  }

  @Get(":organizationId/ai/usage")
  @ApiOperation({ summary: "Inspect organization AI usage and entitlement" })
  aiUsage(@Param("organizationId", ParseUUIDPipe) organizationId: string) {
    return this.ai.getUsageSummary(organizationId);
  }

  @Get(":organizationId/automation/summary")
  @ApiOperation({ summary: "Inspect organization automation health" })
  automationSummary(@Param("organizationId", ParseUUIDPipe) organizationId: string) {
    return this.automation.getAdminSummary(organizationId);
  }

  @Patch(":organizationId/status")
  @ApiOperation({ summary: "Activate, suspend, or archive an organization" })
  setStatus(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Req() req: Request,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Body() body: UpdateOrganizationStatusDto,
  ) {
    return this.organizations.setStatus(organizationId, body.status, adminActor(user, req));
  }

  @Get(":organizationId/entitlements")
  @ApiOperation({ summary: "Effective entitlements for an organization" })
  entitlements(@Param("organizationId", ParseUUIDPipe) organizationId: string) {
    return this.organizations.entitlementsFor(organizationId);
  }

  @Get(":organizationId/subscription")
  @ApiOperation({ summary: "Get the organization's single subscription" })
  getSubscription(@Param("organizationId", ParseUUIDPipe) organizationId: string) {
    return this.subscriptions.getForOrganization(organizationId);
  }

  @Put(":organizationId/subscription")
  @ApiOperation({ summary: "Assign or change the organization's plan" })
  assign(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Req() req: Request,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Body() body: AssignSubscriptionDto,
  ) {
    return this.subscriptions.assign(organizationId, body, adminActor(user, req));
  }

  @Post(":organizationId/subscription/renew")
  @HttpCode(200)
  @ApiOperation({ summary: "Renew or reactivate subscription (ACTIVE + new period)" })
  renew(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Req() req: Request,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Body() body: RenewSubscriptionDto,
  ) {
    return this.subscriptions.renew(organizationId, body, adminActor(user, req));
  }

  @Patch(":organizationId/subscription")
  @ApiOperation({ summary: "Change subscription lifecycle status" })
  setSubscriptionStatus(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Req() req: Request,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Body() body: UpdateSubscriptionStatusDto,
  ) {
    return this.subscriptions.setStatus(organizationId, body.status, adminActor(user, req));
  }

  @Put(":organizationId/overrides/:featureKey")
  @ApiOperation({ summary: "Create or update an organization feature override" })
  upsertOverride(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Req() req: Request,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("featureKey") featureKey: string,
    @Body() body: UpsertFeatureOverrideDto,
  ) {
    return this.overrides.upsert(organizationId, featureKey, body, adminActor(user, req));
  }

  @Delete(":organizationId/overrides/:featureKey")
  @HttpCode(200)
  @ApiOperation({ summary: "Remove an organization feature override" })
  removeOverride(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Req() req: Request,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("featureKey") featureKey: string,
  ) {
    return this.overrides.remove(organizationId, featureKey, adminActor(user, req));
  }
}
