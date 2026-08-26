import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { ChartNoteKind } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
import { tenantWhere } from "../dietitian/tenant-scope";
import { ClientAccessService } from "../clients/client-access.service";
import { parseChartNoteDate } from "./chart-note-date";

const MEAL_SLOTS = new Set(["BREAKFAST", "LUNCH", "DINNER", "SNACK"]);
const KINDS = new Set<ChartNoteKind>(["CLINICAL", "MEAL", "EATING_HABIT", "PREGNANCY"]);

@Injectable()
export class ClientChartNoteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClientAccessService,
  ) {}

  async list(tenant: DietitianTenantContext, clientId: string, kind?: string) {
    await this.access.assertCanAccess(tenant, clientId, "read");
    const filterKind = kind && KINDS.has(kind as ChartNoteKind) ? (kind as ChartNoteKind) : undefined;
    const rows = await this.prisma.clientChartNote.findMany({
      where: {
        clientId,
        ...tenantWhere(tenant.dietitianAccountId),
        ...(filterKind ? { kind: filterKind } : {}),
      },
      orderBy: [{ notedAt: "desc" }, { createdAt: "desc" }],
      take: 200,
    });
    return rows.map((row) => this.toResponse(row));
  }

  async create(
    tenant: DietitianTenantContext,
    clientId: string,
    input: { kind: ChartNoteKind; body: string; mealSlot?: string; notedAt?: string },
  ) {
    await this.access.assertCanAccess(tenant, clientId, "manageRecords");
    const body = input.body.trim();
    if (!body) {
      throw new BadRequestException("Write a note before saving");
    }
    if (body.length > 4000) {
      throw new BadRequestException("Note is too long");
    }
    let mealSlot: string | null = null;
    if (input.kind === "MEAL") {
      const slot = (input.mealSlot ?? "").toUpperCase();
      if (!MEAL_SLOTS.has(slot)) {
        throw new BadRequestException("Choose breakfast, lunch, dinner, or a snack");
      }
      mealSlot = slot;
    }
    const notedAt = parseChartNoteDate(input.notedAt);
    const row = await this.prisma.clientChartNote.create({
      data: {
        dietitianAccountId: tenant.dietitianAccountId,
        clientId,
        kind: input.kind,
        body,
        mealSlot,
        notedAt,
      },
    });
    return this.toResponse(row);
  }

  async remove(tenant: DietitianTenantContext, clientId: string, noteId: string) {
    await this.access.assertCanAccess(tenant, clientId, "manageRecords");
    const existing = await this.prisma.clientChartNote.findFirst({
      where: { id: noteId, clientId, ...tenantWhere(tenant.dietitianAccountId) },
    });
    if (!existing) {
      throw new NotFoundException("Note not found");
    }
    await this.prisma.clientChartNote.delete({ where: { id: noteId } });
    return { ok: true };
  }

  private toResponse(row: {
    id: string;
    kind: ChartNoteKind;
    body: string;
    mealSlot: string | null;
    notedAt: Date;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      kind: row.kind,
      body: row.body,
      mealSlot: row.mealSlot,
      notedAt: row.notedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
