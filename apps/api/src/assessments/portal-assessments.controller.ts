import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { IsObject, IsOptional } from "class-validator";
import type { Prisma } from "@prisma/client";
import { CurrentSession, CurrentUser } from "../auth/decorators/current-user.decorator";
import { SessionGuard } from "../auth/guards/session.guard";
import type { AuthenticatedRequestUser, AuthenticatedSession } from "../auth/auth.types";
import { ClientAccessService } from "../clients/client-access.service";
import { AssessmentService } from "./assessment.service";

class SavePortalAssessmentDto {
  @ApiProperty()
  @IsObject()
  responses!: Record<string, unknown>;
}

class CompletePortalAssessmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  responses?: Record<string, unknown>;
}

@ApiTags("portal")
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller("api/v1/portal/assessments")
export class PortalAssessmentsController {
  constructor(
    private readonly access: ClientAccessService,
    private readonly assessments: AssessmentService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List assessments for the active portal client" })
  async list(
    @CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    const client = await this.access.assertPortalAccess(user.id, {
      activeClientId: session.activeClientId,
    });
    return this.assessments.listForClient(client.dietitianAccountId, client.id);
  }

  @Get("pending-count")
  @ApiOperation({ summary: "Count incomplete portal forms for the nav badge" })
  async pendingCount(
    @CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession,
  ) {
    const client = await this.access.assertPortalAccess(user.id, {
      activeClientId: session.activeClientId,
    });
    const count = await this.assessments.countPendingForClient(client.dietitianAccountId, client.id);
    return { count };
  }

  @Get(":assessmentId")
  async getOne(
    @CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession,
    @Param("assessmentId", ParseUUIDPipe) assessmentId: string,
  ) {
    const client = await this.access.assertPortalAccess(user.id, {
      activeClientId: session.activeClientId,
    });
    return this.assessments.getForClient(client.dietitianAccountId, client.id, assessmentId);
  }

  @Patch(":assessmentId")
  async save(
    @CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession,
    @Param("assessmentId", ParseUUIDPipe) assessmentId: string,
    @Body() body: SavePortalAssessmentDto,
  ) {
    const client = await this.access.assertPortalAccess(user.id, {
      activeClientId: session.activeClientId,
    });
    return this.assessments.saveForClient(
      client.dietitianAccountId,
      client.id,
      assessmentId,
      body.responses as Prisma.InputJsonValue,
    );
  }

  @Post(":assessmentId/complete")
  async complete(
    @CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession,
    @Param("assessmentId", ParseUUIDPipe) assessmentId: string,
    @Body() body: CompletePortalAssessmentDto,
  ) {
    const client = await this.access.assertPortalAccess(user.id, {
      activeClientId: session.activeClientId,
    });
    return this.assessments.completeForClient(
      client.dietitianAccountId,
      client.id,
      assessmentId,
      body.responses as Prisma.InputJsonValue | undefined,
      user.id,
    );
  }
}
