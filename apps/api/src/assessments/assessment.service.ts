import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SecurityEventLogger } from "../auth/security-event.logger";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
import { TimelineService } from "../timeline/timeline.service";
import { ClientAccessService } from "../clients/client-access.service";
import { tenantWhere } from "../dietitian/tenant-scope";
import {
  type AssessmentQuestion,
  type AssessmentSchema,
  deactivateQuestion,
  emptyAssessmentSchema,
  parseAssessmentSchema,
  reorderQuestions,
  toPrismaSchema,
  upsertQuestion,
  validateAssessmentResponses,
} from "./assessment-schema";

@Injectable()
export class AssessmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClientAccessService,
    private readonly timeline: TimelineService,
    private readonly security: SecurityEventLogger,
  ) {}

  async listTemplates(tenant: DietitianTenantContext, includeInactive = false) {
    return this.prisma.assessmentTemplate.findMany({
      where: {
        ...tenantWhere(tenant.dietitianAccountId),
        ...(includeInactive ? {} : { status: "ACTIVE" }),
      },
      orderBy: { name: "asc" },
    });
  }

  async getTemplate(tenant: DietitianTenantContext, templateId: string) {
    const template = await this.prisma.assessmentTemplate.findFirst({
      where: { id: templateId, ...tenantWhere(tenant.dietitianAccountId) },
    });
    if (!template) {
      throw new NotFoundException("Template not found");
    }
    return {
      ...template,
      schema: parseAssessmentSchema(template.schema),
    };
  }

  async createTemplate(
    tenant: DietitianTenantContext,
    input: { name: string; description?: string; schema?: Prisma.InputJsonValue },
  ) {
    const schema = input.schema
      ? toPrismaSchema(parseAssessmentSchema(input.schema))
      : toPrismaSchema(emptyAssessmentSchema());
    return this.prisma.assessmentTemplate.create({
      data: {
        dietitianAccountId: tenant.dietitianAccountId,
        name: input.name.trim(),
        description: input.description?.trim() ?? null,
        schema,
        createdById: tenant.userId,
        version: 1,
      },
    });
  }

  async updateTemplate(
    tenant: DietitianTenantContext,
    templateId: string,
    input: {
      name?: string;
      description?: string;
      schema?: Prisma.InputJsonValue;
      status?: "ACTIVE" | "INACTIVE" | "ARCHIVED";
    },
  ) {
    const template = await this.prisma.assessmentTemplate.findFirst({
      where: { id: templateId, ...tenantWhere(tenant.dietitianAccountId) },
    });
    if (!template) {
      throw new NotFoundException("Template not found");
    }
    const bumpVersion = input.schema !== undefined;
    const schema = input.schema !== undefined ? toPrismaSchema(parseAssessmentSchema(input.schema)) : undefined;
    return this.prisma.assessmentTemplate.update({
      where: { id: templateId },
      data: {
        name: input.name?.trim(),
        description: input.description,
        schema,
        status: input.status,
        version: bumpVersion ? template.version + 1 : template.version,
      },
    });
  }

  async upsertTemplateQuestion(
    tenant: DietitianTenantContext,
    templateId: string,
    sectionId: string,
    question: AssessmentQuestion,
  ) {
    const template = await this.requireTemplate(tenant.dietitianAccountId, templateId);
    const next = upsertQuestion(parseAssessmentSchema(template.schema), sectionId, question);
    return this.prisma.assessmentTemplate.update({
      where: { id: templateId },
      data: {
        schema: toPrismaSchema(next),
        version: template.version + 1,
      },
    });
  }

  async deactivateTemplateQuestion(tenant: DietitianTenantContext, templateId: string, questionId: string) {
    const template = await this.requireTemplate(tenant.dietitianAccountId, templateId);
    const next = deactivateQuestion(parseAssessmentSchema(template.schema), questionId);
    return this.prisma.assessmentTemplate.update({
      where: { id: templateId },
      data: {
        schema: toPrismaSchema(next),
        version: template.version + 1,
      },
    });
  }

  async reorderTemplateQuestions(
    tenant: DietitianTenantContext,
    templateId: string,
    sectionId: string,
    orderedIds: string[],
  ) {
    const template = await this.requireTemplate(tenant.dietitianAccountId, templateId);
    const next = reorderQuestions(parseAssessmentSchema(template.schema), sectionId, orderedIds);
    return this.prisma.assessmentTemplate.update({
      where: { id: templateId },
      data: {
        schema: toPrismaSchema(next),
        version: template.version + 1,
      },
    });
  }

  async list(tenant: DietitianTenantContext, clientId: string) {
    await this.access.assertCanAccess(tenant, clientId, "read");
    return this.listForClient(tenant.dietitianAccountId, clientId);
  }

  async get(tenant: DietitianTenantContext, clientId: string, assessmentId: string) {
    await this.access.assertCanAccess(tenant, clientId, "read");
    return this.getForClient(tenant.dietitianAccountId, clientId, assessmentId);
  }

  async start(tenant: DietitianTenantContext, clientId: string, templateId: string) {
    await this.access.assertCanAccess(tenant, clientId, "manageRecords");
    return this.startForClient(tenant.dietitianAccountId, clientId, templateId, tenant.userId);
  }

  async saveResponses(
    tenant: DietitianTenantContext,
    clientId: string,
    assessmentId: string,
    responses: Prisma.InputJsonValue,
  ) {
    await this.access.assertCanAccess(tenant, clientId, "manageRecords");
    return this.saveForClient(tenant.dietitianAccountId, clientId, assessmentId, responses);
  }

  async complete(
    tenant: DietitianTenantContext,
    clientId: string,
    assessmentId: string,
    responses?: Prisma.InputJsonValue,
    actorUserId?: string,
  ) {
    await this.access.assertCanAccess(tenant, clientId, "manageRecords");
    return this.completeForClient(
      tenant.dietitianAccountId,
      clientId,
      assessmentId,
      responses,
      actorUserId ?? tenant.userId,
    );
  }

  /** Portal / scoped helpers (ownership already asserted). */
  async listForClient(dietitianAccountId: string, clientId: string) {
    const rows = await this.prisma.assessment.findMany({
      where: { clientId, ...tenantWhere(dietitianAccountId) },
      include: { template: true },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => this.toResponse(row));
  }

  async getForClient(dietitianAccountId: string, clientId: string, assessmentId: string) {
    const row = await this.prisma.assessment.findFirst({
      where: { id: assessmentId, clientId, ...tenantWhere(dietitianAccountId) },
      include: { template: true },
    });
    if (!row) {
      throw new NotFoundException("Assessment not found");
    }
    return this.toResponse(row);
  }

  async startForClient(
    dietitianAccountId: string,
    clientId: string,
    templateId: string,
    actorUserId: string | null,
  ) {
    const template = await this.prisma.assessmentTemplate.findFirst({
      where: {
        id: templateId,
        status: "ACTIVE",
        ...tenantWhere(dietitianAccountId),
      },
    });
    if (!template) {
      throw new NotFoundException("Template not found");
    }
    const snapshot = toPrismaSchema(parseAssessmentSchema(template.schema));
    const assessment = await this.prisma.assessment.create({
      data: {
        dietitianAccountId,
        clientId,
        templateId: template.id,
        templateVersion: template.version,
        schemaSnapshot: snapshot,
        status: "IN_PROGRESS",
        startedAt: new Date(),
        createdById: actorUserId,
      },
      include: { template: true },
    });
    await this.timeline.record({
      dietitianAccountId,
      clientId,
      type: "ASSESSMENT_STARTED",
      actorUserId: actorUserId ?? undefined,
      targetType: "assessment",
      targetId: assessment.id,
      metadata: { templateVersion: template.version },
    });
    return this.toResponse(assessment);
  }

  async saveForClient(
    dietitianAccountId: string,
    clientId: string,
    assessmentId: string,
    responses: Prisma.InputJsonValue,
  ) {
    const existing = await this.requireAssessment(dietitianAccountId, clientId, assessmentId);
    if (existing.status === "COMPLETED" || existing.status === "ARCHIVED") {
      throw new BadRequestException("Completed assessments cannot be rewritten");
    }
    const schema = this.schemaForAssessment(existing);
    const cleaned = validateAssessmentResponses(schema, responses, { mode: "save" });
    const assessment = await this.prisma.assessment.update({
      where: { id: assessmentId },
      data: {
        responses: cleaned as Prisma.InputJsonValue,
        status: "IN_PROGRESS",
        startedAt: existing.startedAt ?? new Date(),
      },
      include: { template: true },
    });
    return this.toResponse(assessment);
  }

  async completeForClient(
    dietitianAccountId: string,
    clientId: string,
    assessmentId: string,
    responses: Prisma.InputJsonValue | undefined,
    actorUserId: string | null,
  ) {
    const existing = await this.requireAssessment(dietitianAccountId, clientId, assessmentId);
    if (existing.status === "COMPLETED" || existing.status === "ARCHIVED") {
      throw new BadRequestException("Completed assessments cannot be rewritten");
    }
    const schema = this.schemaForAssessment(existing);
    const merged =
      responses !== undefined
        ? responses
        : ((existing.responses as Record<string, unknown> | null) ?? {});
    const cleaned = validateAssessmentResponses(schema, merged, { mode: "complete" });
    const assessment = await this.prisma.assessment.update({
      where: { id: assessmentId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        responses: cleaned as Prisma.InputJsonValue,
        templateVersion: existing.templateVersion,
        schemaSnapshot: existing.schemaSnapshot ?? undefined,
      },
      include: { template: true },
    });
    await this.timeline.record({
      dietitianAccountId,
      clientId,
      type: "ASSESSMENT_COMPLETED",
      actorUserId: actorUserId ?? undefined,
      targetType: "assessment",
      targetId: assessment.id,
      metadata: { templateVersion: assessment.templateVersion },
    });
    if (actorUserId) {
      await this.security.record({
        type: "assessment_completed",
        outcome: "success",
        userId: actorUserId,
        dietitianAccountId,
        targetType: "assessment",
        targetId: assessment.id,
        metadata: { templateVersion: assessment.templateVersion },
      });
    }
    return this.toResponse(assessment);
  }

  private async requireTemplate(dietitianAccountId: string, templateId: string) {
    const template = await this.prisma.assessmentTemplate.findFirst({
      where: { id: templateId, ...tenantWhere(dietitianAccountId) },
    });
    if (!template) {
      throw new NotFoundException("Template not found");
    }
    return template;
  }

  private async requireAssessment(dietitianAccountId: string, clientId: string, assessmentId: string) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id: assessmentId, clientId, ...tenantWhere(dietitianAccountId) },
      include: { template: true },
    });
    if (!assessment) {
      throw new NotFoundException("Assessment not found");
    }
    return assessment;
  }

  private schemaForAssessment(row: {
    schemaSnapshot?: Prisma.JsonValue | null;
    template: { schema: Prisma.JsonValue };
  }): AssessmentSchema {
    return parseAssessmentSchema(row.schemaSnapshot ?? row.template.schema);
  }

  private toResponse(row: {
    id: string;
    status: string;
    templateVersion: number;
    responses: Prisma.JsonValue | null;
    schemaSnapshot?: Prisma.JsonValue | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    template: { id: string; name: string; version: number; schema: Prisma.JsonValue };
  }) {
    const snapshot = row.schemaSnapshot ?? row.template.schema;
    const schema: AssessmentSchema = parseAssessmentSchema(snapshot);
    return {
      id: row.id,
      status: row.status,
      templateId: row.template.id,
      templateName: row.template.name,
      templateVersion: row.templateVersion,
      currentTemplateVersion: row.template.version,
      responses: row.responses,
      schema,
      schemaSnapshot: row.schemaSnapshot ?? null,
      startedAt: row.startedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
