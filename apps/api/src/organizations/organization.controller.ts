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
import { CurrentTenant } from "./decorators/current-tenant.decorator";
import { AddMemberDto, ChangeMemberRoleDto, TransferOwnershipDto } from "./dto/membership.dto";
import {
  CreateOrganizationDto,
  UpdateOrganizationDto,
  UpdateOrganizationSettingsDto,
} from "./dto/organization.dto";
import {
  OrganizationMemberResponseDto,
  OrganizationResponseDto,
  OrganizationSettingsResponseDto,
  TenantContextResponseDto,
} from "./dto/responses.dto";
import { TenantGuard } from "./guards/tenant.guard";
import { MembershipService } from "./membership.service";
import { OrganizationLifecycleService } from "./organization-lifecycle.service";
import { OrganizationService } from "./organization.service";
import { EntitlementService, publicEntitlement } from "../entitlements/entitlement.service";
import type { TenantContext } from "./tenant.types";
import { ORGANIZATION_ACCESS_DENIED } from "./tenant.types";

@ApiTags("organizations")
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller("api/v1/organizations")
export class OrganizationController {
  constructor(
    private readonly organizations: OrganizationService,
    private readonly members: MembershipService,
    private readonly lifecycle: OrganizationLifecycleService,
    private readonly entitlements: EntitlementService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({
    summary: "Create an organization",
    description:
      "The authenticated user becomes OWNER. The organization starts ACTIVE. No clients or subscriptions are created. Self-serve create requires registrationEnabled.",
  })
  @ApiOkResponse({ type: OrganizationResponseDto })
  async create(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() body: CreateOrganizationDto,
  ): Promise<OrganizationResponseDto> {
    await assertRegistrationEnabled(this.prisma);
    const created = await this.organizations.create(user.id, body);
    if (!created) {
      throw new ForbiddenException(ORGANIZATION_ACCESS_DENIED);
    }
    return created;
  }

  @Get()
  @ApiOperation({ summary: "List organizations the current user belongs to" })
  @ApiOkResponse({ type: [OrganizationResponseDto] })
  listMine(@CurrentUser() user: AuthenticatedRequestUser): Promise<OrganizationResponseDto[]> {
    return this.organizations.listForUser(user.id);
  }

  @Get(":organizationId")
  @UseGuards(TenantGuard)
  @ApiOperation({ summary: "Get an organization the current user belongs to, with tenant context" })
  @ApiOkResponse({ type: OrganizationResponseDto })
  @ApiForbiddenResponse()
  @ApiUnauthorizedResponse()
  async getOne(
    @CurrentUser() user: AuthenticatedRequestUser,
    @CurrentTenant() tenant: TenantContext,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
  ): Promise<OrganizationResponseDto & { context: TenantContextResponseDto }> {
    const organization = await this.organizations.getForUser(user.id, organizationId);
    if (!organization) {
      throw new NotFoundException(ORGANIZATION_ACCESS_DENIED);
    }
    return {
      ...organization,
      context: {
        organizationId: tenant.organizationId,
        organizationName: tenant.organizationName,
        organizationStatus: tenant.organizationStatus,
        membershipId: tenant.organizationId,
        role: "OWNER",
      },
    };
  }

  @Patch(":organizationId")
  @UseGuards(TenantGuard)
  @ApiOperation({ summary: "Update organization name (account owner)" })
  async update(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Body() body: UpdateOrganizationDto,
  ): Promise<OrganizationResponseDto> {
    await this.organizations.updateName(organizationId, body.name);
    const updated = await this.organizations.getForUser(user.id, organizationId);
    if (!updated) {
      throw new ForbiddenException(ORGANIZATION_ACCESS_DENIED);
    }
    return updated;
  }

  @Get(":organizationId/settings")
  @UseGuards(TenantGuard)
  @ApiOperation({ summary: "Get organization settings" })
  @ApiOkResponse({ type: OrganizationSettingsResponseDto })
  async getSettings(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
  ): Promise<OrganizationSettingsResponseDto> {
    const settings = await this.organizations.getSettings(organizationId);
    if (!settings) {
      throw new NotFoundException("Settings not found");
    }
    return this.organizations.toSettingsResponse(settings);
  }

  @Patch(":organizationId/settings")
  @UseGuards(TenantGuard)
  @ApiOperation({ summary: "Update organization settings (account owner)" })
  async updateSettings(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Body() body: UpdateOrganizationSettingsDto,
  ): Promise<OrganizationSettingsResponseDto> {
    const settings = await this.organizations.updateSettings(organizationId, body);
    return this.organizations.toSettingsResponse(settings);
  }

  @Get(":organizationId/entitlements")
  @UseGuards(TenantGuard)
  @ApiOperation({
    summary: "Effective entitlements for this organization",
    description:
      "Read-only. Backend EntitlementService is authoritative. Does not expose admin override reasons.",
  })
  async listEntitlements(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
  ) {
    const rows = await this.entitlements.listEffective(organizationId);
    return rows.map(publicEntitlement);
  }

  @Get(":organizationId/members")
  @UseGuards(TenantGuard)
  @ApiOperation({ summary: "List organization members" })
  @ApiOkResponse({ type: [OrganizationMemberResponseDto] })
  listMembers(
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
  ): Promise<OrganizationMemberResponseDto[]> {
    return this.members.list(organizationId);
  }

  @Post(":organizationId/members")
  @HttpCode(201)
  @UseGuards(TenantGuard)
  @ApiOperation({
    summary: "Add an existing user as DIETITIAN or STAFF (OWNER)",
    description: "Does not create client accounts. Invitation workflows remain later phases.",
  })
  addMember(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Body() body: AddMemberDto,
  ) {
    return this.members.add(organizationId, user.id, body.email, body.role);
  }

  @Patch(":organizationId/members/:membershipId")
  @UseGuards(TenantGuard)
  @ApiOperation({ summary: "Change a member role (OWNER). Cannot remove the last OWNER." })
  changeRole(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("membershipId", ParseUUIDPipe) membershipId: string,
    @Body() body: ChangeMemberRoleDto,
  ) {
    return this.members.changeRole(organizationId, membershipId, body.role, user.id);
  }

  @Post(":organizationId/members/:membershipId/deactivate")
  @HttpCode(201)
  @UseGuards(TenantGuard)
  @ApiOperation({ summary: "Deactivate a membership (OWNER). Cannot deactivate the last OWNER." })
  deactivate(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
    @Param("membershipId", ParseUUIDPipe) membershipId: string,
  ) {
    return this.members.deactivate(organizationId, membershipId, user.id);
  }

  @Post(":organizationId/transfer-ownership")
  @HttpCode(201)
  @UseGuards(TenantGuard)
  @ApiOperation({
    summary: "Transfer ownership to another member (OWNER)",
    description: "Target becomes OWNER; the current user becomes DIETITIAN.",
  })
  transfer(
    @CurrentTenant() tenant: TenantContext,
    @Param("organizationId", ParseUUIDPipe) _organizationId: string,
    @Body() body: TransferOwnershipDto,
  ) {
    return this.members.transferOwnership(tenant.organizationId, tenant.membershipId, body.membershipId);
  }

  @Post(":organizationId/archive")
  @HttpCode(201)
  @UseGuards(TenantGuard)
  @ApiOperation({ summary: "Archive the organization (OWNER). Data is retained." })
  archive(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("organizationId", ParseUUIDPipe) organizationId: string,
  ) {
    return this.lifecycle.setStatus(organizationId, "ARCHIVED", user.id);
  }
}
