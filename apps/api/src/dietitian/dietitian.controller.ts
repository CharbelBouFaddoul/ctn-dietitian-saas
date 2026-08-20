import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { SessionGuard } from "../auth/guards/session.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedRequestUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { assertRegistrationEnabled } from "../platform-settings/registration-gate";
import {
  CreateDietitianDto,
  UpdateDietitianDto,
  UpdateDietitianSettingsDto,
} from "./dto/dietitian.dto";
import {
  DietitianAccountResponseDto,
  DietitianSettingsResponseDto,
} from "./dto/responses.dto";
import { CurrentTenant } from "./decorators/current-tenant.decorator";
import { DietitianGuard } from "./guards/dietitian.guard";
import { DietitianLifecycleService } from "./dietitian-lifecycle.service";
import { DietitianService } from "./dietitian.service";
import { EntitlementService, publicEntitlement } from "../entitlements/entitlement.service";
import { SubscriptionLifecycleService } from "../entitlements/subscription-lifecycle.service";
import { NotificationService } from "../notifications/notification.service";
import type { DietitianTenantContext } from "./dietitian.types";
import { DIETITIAN_ACCESS_DENIED } from "./dietitian.types";

@ApiTags("dietitian")
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller("api/v1/dietitian")
export class DietitianController {
  constructor(
    private readonly dietitians: DietitianService,
    private readonly lifecycle: DietitianLifecycleService,
    private readonly entitlements: EntitlementService,
    private readonly subscriptionLifecycle: SubscriptionLifecycleService,
    private readonly notifications: NotificationService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({
    summary: "Create a dietitian practice account",
    description:
      "Creates DietitianAccount + DietitianSettings only. Self-serve create requires registrationEnabled.",
  })
  @ApiOkResponse({ type: DietitianAccountResponseDto })
  async create(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() body: CreateDietitianDto,
  ): Promise<DietitianAccountResponseDto> {
    await assertRegistrationEnabled(this.prisma);
    const created = await this.dietitians.create(user.id, body);
    if (!created) {
      throw new ForbiddenException(DIETITIAN_ACCESS_DENIED);
    }
    return created as DietitianAccountResponseDto;
  }

  @Get()
  @ApiOperation({ summary: "List dietitian accounts owned by the current user" })
  @ApiOkResponse({ type: [DietitianAccountResponseDto] })
  listMine(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.dietitians.listForUser(user.id);
  }

  @Get(":dietitianAccountId")
  @UseGuards(DietitianGuard)
  @ApiOperation({ summary: "Get dietitian account with tenant context" })
  @ApiOkResponse({ type: DietitianAccountResponseDto })
  @ApiForbiddenResponse()
  @ApiUnauthorizedResponse()
  async getOne(
    @CurrentUser() user: AuthenticatedRequestUser,
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("dietitianAccountId", ParseUUIDPipe) dietitianAccountId: string,
  ) {
    const account = await this.dietitians.getForUser(user.id, dietitianAccountId);
    if (!account) {
      throw new NotFoundException(DIETITIAN_ACCESS_DENIED);
    }
    return {
      ...account,
      context: {
        dietitianAccountId: tenant.dietitianAccountId,
        displayName: tenant.displayName,
        accountStatus: tenant.accountStatus,
      },
    };
  }

  @Patch(":dietitianAccountId")
  @UseGuards(DietitianGuard)
  @ApiOperation({ summary: "Update practice display name" })
  async update(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("dietitianAccountId", ParseUUIDPipe) dietitianAccountId: string,
    @Body() body: UpdateDietitianDto,
  ) {
    await this.dietitians.updateName(dietitianAccountId, body.name);
    const updated = await this.dietitians.getForUser(user.id, dietitianAccountId);
    if (!updated) {
      throw new ForbiddenException(DIETITIAN_ACCESS_DENIED);
    }
    return updated;
  }

  @Get(":dietitianAccountId/settings")
  @UseGuards(DietitianGuard)
  @ApiOperation({ summary: "Get practice settings" })
  @ApiOkResponse({ type: DietitianSettingsResponseDto })
  async getSettings(
    @Param("dietitianAccountId", ParseUUIDPipe) dietitianAccountId: string,
  ): Promise<DietitianSettingsResponseDto> {
    const settings = await this.dietitians.getSettings(dietitianAccountId);
    if (!settings) {
      throw new NotFoundException("Settings not found");
    }
    return this.dietitians.toSettingsResponse(settings);
  }

  @Patch(":dietitianAccountId/settings")
  @UseGuards(DietitianGuard)
  @ApiOperation({ summary: "Update practice settings" })
  async updateSettings(
    @Param("dietitianAccountId", ParseUUIDPipe) dietitianAccountId: string,
    @Body() body: UpdateDietitianSettingsDto,
  ): Promise<DietitianSettingsResponseDto> {
    const settings = await this.dietitians.updateSettings(dietitianAccountId, body);
    return this.dietitians.toSettingsResponse(settings);
  }

  @Get(":dietitianAccountId/entitlements")
  @UseGuards(DietitianGuard)
  @ApiOperation({ summary: "Effective entitlements for this practice" })
  async listEntitlements(
    @Param("dietitianAccountId", ParseUUIDPipe) dietitianAccountId: string,
  ) {
    const rows = await this.entitlements.listEffective(dietitianAccountId);
    return rows.map(publicEntitlement);
  }

  @Get(":dietitianAccountId/subscription-access")
  @UseGuards(DietitianGuard)
  @ApiOperation({
    summary: "Derived subscription access state for practice UI",
    description:
      "Allowed even when LOCKED so the practice shell can show the locked screen. Mutations remain blocked.",
  })
  async subscriptionAccess(
    @Param("dietitianAccountId", ParseUUIDPipe) dietitianAccountId: string,
    @CurrentTenant() tenant: DietitianTenantContext,
  ) {
    const access =
      tenant.subscriptionAccess ??
      (await this.subscriptionLifecycle.getAccessForAccount(dietitianAccountId));
    await this.notifications.notifySubscriptionAccessIfNeeded({
      dietitianAccountId,
      accessState: access.accessState,
      currentPeriodEnd: access.currentPeriodEnd,
    });
    return {
      accessState: access.accessState,
      status: access.status,
      planSlug: access.planSlug,
      planName: access.planName,
      currentPeriodStart: access.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: access.currentPeriodEnd?.toISOString() ?? null,
      graceEndsAt: access.graceEndsAt?.toISOString() ?? null,
      readOnlyEndsAt: access.readOnlyEndsAt?.toISOString() ?? null,
      daysRemainingInPhase: access.daysRemainingInPhase,
    };
  }

  @Post(":dietitianAccountId/archive")
  @HttpCode(201)
  @UseGuards(DietitianGuard)
  @ApiOperation({ summary: "Archive the practice account. Data is retained." })
  archive(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("dietitianAccountId", ParseUUIDPipe) dietitianAccountId: string,
  ) {
    return this.lifecycle.setStatus(dietitianAccountId, "ARCHIVED", user.id);
  }
}
