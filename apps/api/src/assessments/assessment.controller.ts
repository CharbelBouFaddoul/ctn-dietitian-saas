import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { SessionGuard } from "../auth/guards/session.guard";
import { CurrentTenant } from "../dietitian/decorators/current-tenant.decorator";
import { DietitianGuard } from "../dietitian/guards/dietitian.guard";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
import { ClientActionRequired } from "../clients/decorators/client-action.decorator";
import { ClientAccessGuard } from "../clients/guards/client-access.guard";
import { AssessmentService } from "./assessment.service";
import type { Prisma } from "@prisma/client";
import { ASSESSMENT_QUESTION_TYPES, type AssessmentQuestionType } from "./assessment-schema";

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  schema?: Record<string, unknown>;
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

class QuestionOptionDto {
  @ApiProperty()
  @IsString()
  id!: string;

  @ApiProperty()
  @IsString()
  label!: string;
}

class UpsertQuestionDto {
  @ApiProperty({ default: "main" })
  @IsOptional()
  @IsString()
  sectionId?: string;

  @ApiProperty()
  @IsString()
  id!: string;

  @ApiProperty({ enum: ASSESSMENT_QUESTION_TYPES })
  @IsEnum(ASSESSMENT_QUESTION_TYPES)
  type!: AssessmentQuestionType;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  label!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ type: [QuestionOptionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  options?: QuestionOptionDto[];
}

class ReorderQuestionsDto {
  @ApiProperty({ default: "main" })
  @IsOptional()
  @IsString()
  sectionId?: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  orderedIds!: string[];
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
  listTemplates(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Query("includeInactive") includeInactive?: string,
  ) {
    return this.assessments.listTemplates(tenant, includeInactive === "true" || includeInactive === "1");
  }

  @Get("assessment-templates/:templateId")
  getTemplate(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("templateId", ParseUUIDPipe) templateId: string,
  ) {
    return this.assessments.getTemplate(tenant, templateId);
  }

  @Post("assessment-templates")
  createTemplate(@CurrentTenant() tenant: DietitianTenantContext, @Body() body: CreateTemplateDto) {
    return this.assessments.createTemplate(tenant, {
      ...body,
      schema: body.schema as Prisma.InputJsonValue | undefined,
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

  @Post("assessment-templates/:templateId/questions")
  upsertQuestion(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("templateId", ParseUUIDPipe) templateId: string,
    @Body() body: UpsertQuestionDto,
  ) {
    return this.assessments.upsertTemplateQuestion(tenant, templateId, body.sectionId ?? "main", {
      id: body.id,
      type: body.type,
      label: body.label,
      required: body.required,
      active: body.active,
      options: body.options,
    });
  }

  @Post("assessment-templates/:templateId/questions/reorder")
  reorderQuestions(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("templateId", ParseUUIDPipe) templateId: string,
    @Body() body: ReorderQuestionsDto,
  ) {
    return this.assessments.reorderTemplateQuestions(
      tenant,
      templateId,
      body.sectionId ?? "main",
      body.orderedIds,
    );
  }

  @Post("assessment-templates/:templateId/questions/:questionId/deactivate")
  deactivateQuestion(
    @CurrentTenant() tenant: DietitianTenantContext,
    @Param("templateId", ParseUUIDPipe) templateId: string,
    @Param("questionId") questionId: string,
  ) {
    return this.assessments.deactivateTemplateQuestion(tenant, templateId, questionId);
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
