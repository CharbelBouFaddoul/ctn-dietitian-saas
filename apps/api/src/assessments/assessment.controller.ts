import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiCookieAuth, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { IsEnum, IsObject, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";
import { SessionGuard } from "../auth/guards/session.guard";
import { CurrentTenant } from "../dietitian/decorators/current-tenant.decorator";
import { DietitianGuard } from "../dietitian/guards/dietitian.guard";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
import { ClientActionRequired } from "../clients/decorators/client-action.decorator";
import { ClientAccessGuard } from "../clients/guards/client-access.guard";
import { AssessmentService } from "./assessment.service";
import type { Prisma } from "@prisma/client";

class CreateTemplateDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty()
  @IsObject()
  schema!: Record<string, unknown>;
}

class UpdateTemplateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  schema?: Record<string, unknown>;

  @ApiPropertyOptional({ enum: ["ACTIVE", "INACTIVE", "ARCHIVED"] })
  @IsOptional()
  @IsEnum(["ACTIVE", "INACTIVE", "ARCHIVED"])
  status?: "ACTIVE" | "INACTIVE" | "ARCHIVED";
}

class StartAssessmentDto {
  @ApiProperty()
  @IsUUID()
  templateId!: string;
}

class SaveAssessmentDto {
  @ApiProperty()
  @IsObject()
  responses!: Record<string, unknown>;
}

class CompleteAssessmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  responses?: Record<string, unknown>;
}

@ApiTags("assessments")
@ApiCookieAuth()
@UseGuards(SessionGuard, DietitianGuard)
@Controller("api/v1/dietitian/:dietitianAccountId")
export class AssessmentController {
  constructor(private readonly assessments: AssessmentService) {}

  @Get("assessment-templates")
  listTemplates(@CurrentTenant() tenant: DietitianTenantContext) {
    return this.assessments.listTemplates(tenant);
  }

  @Post("assessment-templates")
  createTemplate(@CurrentTenant() tenant: DietitianTenantContext, @Body() body: CreateTemplateDto) {
    return this.assessments.createTemplate(tenant, {
      ...body,
      schema: body.schema as Prisma.InputJsonValue,
    });
  }

  @Patch("assessment-templates/:templateId")
  updateTemplate(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("templateId", ParseUUIDPipe) templateId: string,
    @Body() body: UpdateTemplateDto,
  ) {
    return this.assessments.updateTemplate(tenant, templateId, {
      ...body,
      schema: body.schema as Prisma.InputJsonValue | undefined,
    });
  }

  @Get("clients/:clientId/assessments")
  @UseGuards(ClientAccessGuard)
  list(@CurrentTenant() tenant: DietitianTenantContext, @Param("clientId", ParseUUIDPipe) clientId: string) {
    return this.assessments.list(tenant, clientId);
  }

  @Get("clients/:clientId/assessments/:assessmentId")
  @UseGuards(ClientAccessGuard)
  getOne(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Param("assessmentId", ParseUUIDPipe) assessmentId: string,
  ) {
    return this.assessments.get(tenant, clientId, assessmentId);
  }

  @Post("clients/:clientId/assessments")
  @UseGuards(ClientAccessGuard)
  @ClientActionRequired("manageRecords")
  start(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Body() body: StartAssessmentDto,
  ) {
    return this.assessments.start(tenant, clientId, body.templateId);
  }

  @Patch("clients/:clientId/assessments/:assessmentId")
  @UseGuards(ClientAccessGuard)
  @ClientActionRequired("manageRecords")
  save(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Param("assessmentId", ParseUUIDPipe) assessmentId: string,
    @Body() body: SaveAssessmentDto,
  ) {
    return this.assessments.saveResponses(
      tenant,
      clientId,
      assessmentId,
      body.responses as Prisma.InputJsonValue,
    );
  }

  @Post("clients/:clientId/assessments/:assessmentId/complete")
  @UseGuards(ClientAccessGuard)
  @ClientActionRequired("manageRecords")
  complete(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("clientId", ParseUUIDPipe) clientId: string,
    @Param("assessmentId", ParseUUIDPipe) assessmentId: string,
    @Body() body: CompleteAssessmentDto,
  ) {
    return this.assessments.complete(
      tenant,
      clientId,
      assessmentId,
      body.responses as Prisma.InputJsonValue | undefined,
    );
  }
}
