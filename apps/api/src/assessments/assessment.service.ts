import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SecurityEventLogger } from "../auth/security-event.logger";
import type { TenantContext } from "../organizations/tenant.types";
import { TimelineService } from "../timeline/timeline.service";
import { ClientAccessService } from "../clients/client-access.service";
import { legacyOrganizationId, tenantWhere } from "../organizations/tenant-scope";

@Injectable()
export class AssessmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClientAccessService,
    private readonly timeline: TimelineService,
    private readonly security: SecurityEventLogger,
  ) {}

  async listTemplates(tenant: TenantContext) {
    return this.prisma.assessmentTemplate.findMany({
      where: {
        status: "ACTIVE",
        OR: [{ organizationId: null, dietitianAccountId: null }, { ...tenantWhere(tenant.organizationId) }],
      },
      orderBy: { name: "asc" },
    });
  }

  async createTemplate(
    tenant: TenantContext,
    input: { name: string; description?: string; schema: Prisma.InputJsonValue },
  ) {
    return this.prisma.assessmentTemplate.create({
      data: {
        dietitianAccountId: tenant.organizationId,
        organizationId: legacyOrganizationId(tenant),
        name: input.name.trim(),
        description: input.description?.trim() ?? null,
        schema: input.schema,
        createdById: tenant.userId,
        version: 1,
      },
    });
  }

  async updateTemplate(
    tenant: TenantContext,
    templateId: string,
    input: { name?: string; description?: string; schema?: Prisma.InputJsonValue; status?: "ACTIVE" | "INACTIVE" | "ARCHIVED" },
  ) {
    const template = await this.prisma.assessmentTemplate.findFirst({
      where: { id: templateId, ...tenantWhere(tenant.organizationId) },
    });
    if (!template) {
      throw new NotFoundException("Template not found");
    }
    const bumpVersion = input.schema !== undefined;
    return this.prisma.assessmentTemplate.update({
      where: { id: templateId },
      data: {
        name: input.name?.trim(),
        description: input.description,
        schema: input.schema,
        status: input.status,
        version: bumpVersion ? template.version + 1 : template.version,
      },
    });
  }

  async list(tenant: TenantContext, clientId: string) {
    await this.access.assertCanAccess(tenant, clientId, "read");
    const rows = await this.prisma.assessment.findMany({
      where: { clientId, ...tenantWhere(tenant.organizationId) },
      include: { template: true },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => this.toResponse(row));
  }

  async start(tenant: TenantContext, clientId: string, templateId: string) {
    await this.access.assertCanAccess(tenant, clientId, "manageRecords");
    const template = await this.prisma.assessmentTemplate.findFirst({
      where: {
        id: templateId,
        status: "ACTIVE",
        OR: [{ organizationId: null, dietitianAccountId: null }, { ...tenantWhere(tenant.organizationId) }],
      },
    });
    if (!template) {
      throw new NotFoundException("Template not found");
    }
    const assessment = await this.prisma.assessment.create({
      data: {
        dietitianAccountId: tenant.organizationId,
        organizationId: legacyOrganizationId(tenant),
        clientId,
        templateId: template.id,
        templateVersion: template.version,
        status: "IN_PROGRESS",
        startedAt: new Date(),
        createdById: tenant.userId,
      },
      include: { template: true },
    });
    await this.timeline.record({
      organizationId: tenant.organizationId,
      legacyOrganizationId: legacyOrganizationId(tenant),
      clientId,
      type: "ASSESSMENT_STARTED",
      actorUserId: tenant.userId,
      targetType: "assessment",
      targetId: assessment.id,
      metadata: { templateVersion: template.version },
    });
    return this.toResponse(assessment);
  }

  async saveResponses(tenant: TenantContext, clientId: string, assessmentId: string, responses: Prisma.InputJsonValue) {
    await this.access.assertCanAccess(tenant, clientId, "manageRecords");
    const existing = await this.requireAssessment(tenant.organizationId, clientId, assessmentId);
    if (existing.status === "COMPLETED" || existing.status === "ARCHIVED") {
      throw new BadRequestException("Completed assessments cannot be rewritten");
    }
    const assessment = await this.prisma.assessment.update({
      where: { id: assessmentId },
      data: { responses, status: "IN_PROGRESS", startedAt: existing.startedAt ?? new Date() },
      include: { template: true },
    });
    return this.toResponse(assessment);
  }

  async complete(tenant: TenantContext, clientId: string, assessmentId: string, responses?: Prisma.InputJsonValue) {
    await this.access.assertCanAccess(tenant, clientId, "manageRecords");
    const existing = await this.requireAssessment(tenant.organizationId, clientId, assessmentId);
    if (existing.status === "COMPLETED" || existing.status === "ARCHIVED") {
      throw new BadRequestException("Completed assessments cannot be rewritten");
    }
    const assessment = await this.prisma.assessment.update({
      where: { id: assessmentId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        responses: responses ?? existing.responses ?? undefined,
        templateVersion: existing.templateVersion,
      },
      include: { template: true },
    });
    await this.timeline.record({
      organizationId: tenant.organizationId,
      legacyOrganizationId: legacyOrganizationId(tenant),
      clientId,
      type: "ASSESSMENT_COMPLETED",
      actorUserId: tenant.userId,
      targetType: "assessment",
      targetId: assessment.id,
      metadata: { templateVersion: assessment.templateVersion },
    });
    await this.security.record({
      type: "assessment_completed",
      outcome: "success",
      userId: tenant.userId,
      organizationId: tenant.organizationId,
      dietitianAccountId: tenant.organizationId,
      targetType: "assessment",
      targetId: assessment.id,
      metadata: { templateVersion: assessment.templateVersion },
    });
    return this.toResponse(assessment);
  }

  private async requireAssessment(organizationId: string, clientId: string, assessmentId: string) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id: assessmentId, clientId, organizationId },
    });
    if (!assessment) {
      throw new NotFoundException("Assessment not found");
    }
    return assessment;
  }

  private toResponse(row: {
    id: string;
    status: string;
    templateVersion: number;
    responses: Prisma.JsonValue | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    template: { id: string; name: string; version: number; schema: Prisma.JsonValue };
  }) {
    return {
      id: row.id,
      status: row.status,
      templateId: row.template.id,
      templateName: row.template.name,
      templateVersion: row.templateVersion,
      currentTemplateVersion: row.template.version,
      responses: row.responses,
      schema: row.template.schema,
      startedAt: row.startedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
