import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Client, Invoice, InvoiceItem, InvoiceStatus, Prisma } from "@prisma/client";
import { localDateKey } from "@nutrition-saas/utilities";
import { EmailService } from "../email/email.service";
import { SecurityEventLogger } from "../auth/security-event.logger";
import { ClientAccessService } from "../clients/client-access.service";
import { PrismaService } from "../prisma/prisma.service";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
import { TimelineService } from "../timeline/timeline.service";
import { NotificationService } from "../notifications/notification.service";
import { computeLineTotal, computeInvoiceTotals, decimalToNumber, money, sumMoney } from "./invoice-money";
import type { DiscountType } from "./invoice-money";
import { InvoiceNumberService } from "./invoice-number.service";
import { requireDietitianAccountId, tenantWhere } from "../dietitian/tenant-scope";

export interface InvoiceItemInput {
  description: string;
  quantity: number | string;
  unitPrice: number | string;
}

export interface InvoiceTotalsInput {
  discountType?: DiscountType | null;
  discountValue?: number | null;
  taxRatePercent?: number | null;
}

const PORTAL_VISIBLE: InvoiceStatus[] = ["ISSUED", "SENT", "PAID", "OVERDUE"];
const EDITABLE: InvoiceStatus[] = ["DRAFT"];
const OPEN_UNPAID: InvoiceStatus[] = ["ISSUED", "SENT", "OVERDUE"];

@Injectable()
export class InvoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ClientAccessService,
    private readonly timeline: TimelineService,
    private readonly security: SecurityEventLogger,
    private readonly numbers: InvoiceNumberService,
    private readonly email: EmailService,
    private readonly notifications: NotificationService,
  ) {}

  async listForOrg(
    tenant: DietitianTenantContext,
    query: {
      clientId?: string;
      status?: InvoiceStatus;
      overdue?: boolean;
      search?: string;
      issuedFrom?: string;
      issuedTo?: string;
      page?: number;
      limit?: number;
    },
  ) {
    await this.refreshOverdue(tenant.dietitianAccountId);
    const visible = this.access.visibleWhere(tenant);
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 25));
    const issuedFrom = this.tryParseDate(query.issuedFrom);
    const issuedTo = this.tryParseDate(query.issuedTo);
    const where: Prisma.InvoiceWhereInput = {
      dietitianAccountId: tenant.dietitianAccountId,
      archivedAt: null,
      client: visible,
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.overdue ? { status: "OVERDUE" } : {}),
      ...(issuedFrom || issuedTo
        ? {
            issueDate: {
              ...(issuedFrom ? { gte: issuedFrom } : {}),
              ...(issuedTo ? { lte: issuedTo } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { invoiceNumber: { contains: query.search, mode: "insensitive" } },
              { client: { firstName: { contains: query.search, mode: "insensitive" } } },
              { client: { lastName: { contains: query.search, mode: "insensitive" } } },
              { client: { displayName: { contains: query.search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: { client: true, items: { orderBy: { sortOrder: "asc" } } },
        orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return {
      items: rows.map((row) => this.toResponse(row)),
      page,
      limit,
      total,
    };
  }

  async listForClient(tenant: DietitianTenantContext, clientId: string) {
    await this.access.assertCanAccess(tenant, clientId, "read");
    await this.refreshOverdue(tenant.dietitianAccountId);
    const rows = await this.prisma.invoice.findMany({
      where: { ...tenantWhere(tenant.dietitianAccountId), clientId, archivedAt: null },
      include: { items: { orderBy: { sortOrder: "asc" } } },
      orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
    });
    return rows.map((row) => this.toResponse(row));
  }

  async getForOrg(tenant: DietitianTenantContext, invoiceId: string) {
    await this.refreshOverdue(tenant.dietitianAccountId);
    const invoice = await this.findOrgInvoice(tenant, invoiceId);
    return this.toResponse(invoice);
  }

  async getPrintPayload(tenant: DietitianTenantContext, invoiceId: string) {
    const invoice = await this.findOrgInvoice(tenant, invoiceId);
    const settings = await this.prisma.dietitianSettings.findUnique({
      where: { dietitianAccountId: tenant.dietitianAccountId },
    });
    const org = await this.prisma.dietitianAccount.findUniqueOrThrow({
      where: { id: tenant.dietitianAccountId },
    });
    return {
      invoice: this.toResponse(invoice),
      practice: {
        organizationName: org.displayName,
        practiceName: settings?.practiceName ?? org.displayName,
        contactEmail: settings?.contactEmail ?? null,
        contactPhone: settings?.contactPhone ?? null,
        addressLine1: settings?.addressLine1 ?? null,
        addressLine2: settings?.addressLine2 ?? null,
        city: settings?.city ?? null,
        region: settings?.region ?? null,
        postalCode: settings?.postalCode ?? null,
        country: settings?.country ?? null,
        invoiceFooter: settings?.invoiceFooter ?? null,
        currency: settings?.currency ?? invoice.currency,
      },
    };
  }

  async createDraft(
    tenant: DietitianTenantContext,
    clientId: string,
    input: {
      issueDate?: string;
      dueDate?: string;
      currency?: string;
      notes?: string;
      items: InvoiceItemInput[];
      discountType?: DiscountType | null;
      discountValue?: number | null;
      taxRatePercent?: number | null;
    },
  ) {
    await this.access.assertCanAccess(tenant, clientId, "manageRecords");
    if (!input.items.length) {
      throw new BadRequestException("At least one line item is required");
    }
    const settings = await this.prisma.dietitianSettings.findUnique({
      where: { dietitianAccountId: tenant.dietitianAccountId },
    });
    const currency = input.currency ?? settings?.currency ?? "USD";
    const issueDate = input.issueDate ? this.parseDate(input.issueDate) : null;
    const dueDate =
      input.dueDate !== undefined
        ? input.dueDate
          ? this.parseDate(input.dueDate)
          : null
        : issueDate && settings?.invoiceDefaultDueDays
          ? this.addDays(issueDate, settings.invoiceDefaultDueDays)
          : null;
    const taxRatePercent =
      input.taxRatePercent !== undefined && input.taxRatePercent !== null
        ? input.taxRatePercent
        : settings?.invoiceDefaultTaxPercent != null
          ? Number(settings.invoiceDefaultTaxPercent)
          : 0;
    const computed = this.computeItems(input.items, {
      discountType: input.discountType ?? null,
      discountValue: input.discountValue ?? null,
      taxRatePercent,
    });
    const invoice = await this.prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          dietitianAccountId: tenant.dietitianAccountId,
          clientId,
          status: "DRAFT",
          issueDate,
          dueDate,
          currency,
          subtotal: computed.subtotal,
          discountType: computed.discountType,
          discountValue: computed.discountValue,
          discountAmount: computed.discountAmount,
          taxRatePercent: computed.taxRatePercent,
          taxAmount: computed.taxAmount,
          total: computed.total,
          notes: input.notes?.trim() ?? null,
          createdById: tenant.userId,
          items: {
            create: computed.items.map((item, index) => ({
              dietitianAccountId: tenant.dietitianAccountId,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              lineTotal: item.lineTotal,
              sortOrder: index,
            })),
          },
        },
        include: { client: true, items: { orderBy: { sortOrder: "asc" } } },
      });
      return created;
    });
    await this.timeline.record({
      dietitianAccountId: tenant.dietitianAccountId,
      clientId,
      type: "INVOICE_CREATED",
      actorUserId: tenant.userId,
      targetType: "invoice",
      targetId: invoice.id,
      metadata: { status: invoice.status },
    });
    await this.security.record({
      type: "invoice_created",
      outcome: "success",
      userId: tenant.userId,
      dietitianAccountId: tenant.dietitianAccountId,
      targetType: "invoice",
      targetId: invoice.id,
    });
    return this.toResponse(invoice);
  }

  async updateDraft(
    tenant: DietitianTenantContext,
    invoiceId: string,
    input: {
      issueDate?: string | null;
      dueDate?: string | null;
      currency?: string;
      notes?: string | null;
      items?: InvoiceItemInput[];
      discountType?: DiscountType | null;
      discountValue?: number | null;
      taxRatePercent?: number | null;
    },
  ) {
    const existing = await this.findOrgInvoice(tenant, invoiceId);
    if (!EDITABLE.includes(existing.status)) {
      throw new BadRequestException("Only draft invoices can be edited");
    }
    await this.access.assertCanAccess(tenant, existing.clientId, "manageRecords");

    const itemsInput =
      input.items ??
      existing.items.map((item) => ({
        description: item.description,
        quantity: Number(item.quantity.toString()),
        unitPrice: Number(item.unitPrice.toString()),
      }));
    const totalsInput: InvoiceTotalsInput = {
      discountType:
        input.discountType !== undefined
          ? input.discountType
          : (existing.discountType as DiscountType | null),
      discountValue:
        input.discountValue !== undefined
          ? input.discountValue
          : existing.discountValue != null
            ? Number(existing.discountValue)
            : null,
      taxRatePercent:
        input.taxRatePercent !== undefined
          ? input.taxRatePercent
          : Number(existing.taxRatePercent),
    };
    const computed = this.computeItems(itemsInput, totalsInput);

    const invoice = await this.prisma.$transaction(async (tx) => {
      if (input.items) {
        await tx.invoiceItem.deleteMany({ where: { invoiceId } });
      }
      return tx.invoice.update({
        where: { id: invoiceId },
        data: {
          issueDate: input.issueDate === undefined ? undefined : input.issueDate ? this.parseDate(input.issueDate) : null,
          dueDate: input.dueDate === undefined ? undefined : input.dueDate ? this.parseDate(input.dueDate) : null,
          currency: input.currency,
          notes: input.notes === undefined ? undefined : input.notes,
          subtotal: computed.subtotal,
          discountType: computed.discountType,
          discountValue: computed.discountValue,
          discountAmount: computed.discountAmount,
          taxRatePercent: computed.taxRatePercent,
          taxAmount: computed.taxAmount,
          total: computed.total,
          ...(input.items
            ? {
                items: {
                  create: computed.items.map((item, index) => ({
                    dietitianAccountId: tenant.dietitianAccountId,
                    description: item.description,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    lineTotal: item.lineTotal,
                    sortOrder: index,
                  })),
                },
              }
            : {}),
        },
        include: { client: true, items: { orderBy: { sortOrder: "asc" } } },
      });
    });
    await this.security.record({
      type: "invoice_updated",
      outcome: "success",
      userId: tenant.userId,
      dietitianAccountId: tenant.dietitianAccountId,
      targetType: "invoice",
      targetId: invoice.id,
    });
    return this.toResponse(invoice);
  }

  async issue(tenant: DietitianTenantContext, invoiceId: string) {
    const existing = await this.findOrgInvoice(tenant, invoiceId);
    if (existing.status !== "DRAFT") {
      throw new BadRequestException("Only draft invoices can be issued");
    }
    await this.access.assertCanAccess(tenant, existing.clientId, "manageRecords");
    const settings = await this.prisma.dietitianSettings.findUnique({
      where: { dietitianAccountId: tenant.dietitianAccountId },
    });
    const issueDate = existing.issueDate ?? this.todayDate(settings?.timezone ?? "UTC");
    const dueDate =
      existing.dueDate ??
      (settings?.invoiceDefaultDueDays ? this.addDays(issueDate, settings.invoiceDefaultDueDays) : issueDate);
    const invoice = await this.prisma.$transaction(async (tx) => {
      const invoiceNumber = await this.numbers.allocate(tenant.dietitianAccountId, tx);
      return tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: "ISSUED",
          invoiceNumber,
          issueDate,
          dueDate,
          issuedAt: new Date(),
        },
        include: { client: true, items: { orderBy: { sortOrder: "asc" } } },
      });
    });
    await this.timeline.record({
      dietitianAccountId: tenant.dietitianAccountId,
      clientId: invoice.clientId,
      type: "INVOICE_ISSUED",
      actorUserId: tenant.userId,
      targetType: "invoice",
      targetId: invoice.id,
      metadata: { invoiceNumber: invoice.invoiceNumber },
    });
    await this.security.record({
      type: "invoice_issued",
      outcome: "success",
      userId: tenant.userId,
      dietitianAccountId: tenant.dietitianAccountId,
      targetType: "invoice",
      targetId: invoice.id,
    });
    return this.toResponse(invoice);
  }

  async send(tenant: DietitianTenantContext, invoiceId: string) {
    const existing = await this.findOrgInvoice(tenant, invoiceId);
    if (!["ISSUED", "SENT", "OVERDUE"].includes(existing.status)) {
      throw new BadRequestException("Invoice must be issued before sending");
    }
    await this.access.assertCanAccess(tenant, existing.clientId, "manageRecords");
    const invoice = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: existing.status === "OVERDUE" ? "OVERDUE" : "SENT", sentAt: new Date() },
      include: { client: true, items: { orderBy: { sortOrder: "asc" } } },
    });
    if (invoice.status === "SENT") {
      await this.timeline.record({
        dietitianAccountId: tenant.dietitianAccountId,
        clientId: invoice.clientId,
        type: "INVOICE_SENT",
        actorUserId: tenant.userId,
        targetType: "invoice",
        targetId: invoice.id,
        metadata: { invoiceNumber: invoice.invoiceNumber },
      });
    }
    const clientAccount = await this.prisma.clientAccount.findUnique({
      where: { clientId: invoice.clientId },
      include: { user: true },
    });
    if (clientAccount?.userId) {
      await this.notifications.create({
        dietitianAccountId: tenant.dietitianAccountId,
        userId: clientAccount.userId,
        clientId: invoice.clientId,
        type: "INVOICE_SENT",
        title: "Invoice available",
        body: `Invoice ${invoice.invoiceNumber ?? ""} is ready to view.`,
        targetType: "invoice",
        targetId: invoice.id,
      });
      if (clientAccount.user.email) {
        await this.email.sendInvoiceNotification(
          clientAccount.user.email,
          invoice.invoiceNumber ?? invoice.id,
          decimalToNumber(invoice.total),
          invoice.currency,
        );
      }
    }
    await this.security.record({
      type: "invoice_sent",
      outcome: "success",
      userId: tenant.userId,
      dietitianAccountId: tenant.dietitianAccountId,
      targetType: "invoice",
      targetId: invoice.id,
    });
    return this.toResponse(invoice);
  }

  async markPaid(tenant: DietitianTenantContext, invoiceId: string) {
    const existing = await this.findOrgInvoice(tenant, invoiceId);
    if (!OPEN_UNPAID.includes(existing.status) && existing.status !== "PAID") {
      throw new BadRequestException("Invoice cannot be marked paid from its current status");
    }
    if (existing.status === "PAID") {
      return this.toResponse(existing);
    }
    await this.access.assertCanAccess(tenant, existing.clientId, "manageRecords");
    const invoice = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: "PAID", paidAt: new Date() },
      include: { client: true, items: { orderBy: { sortOrder: "asc" } } },
    });
    await this.timeline.record({
      dietitianAccountId: tenant.dietitianAccountId,
      clientId: invoice.clientId,
      type: "INVOICE_PAID",
      actorUserId: tenant.userId,
      targetType: "invoice",
      targetId: invoice.id,
      metadata: { invoiceNumber: invoice.invoiceNumber },
    });
    await this.security.record({
      type: "invoice_paid",
      outcome: "success",
      userId: tenant.userId,
      dietitianAccountId: tenant.dietitianAccountId,
      targetType: "invoice",
      targetId: invoice.id,
    });
    return this.toResponse(invoice);
  }

  async cancel(tenant: DietitianTenantContext, invoiceId: string) {
    const existing = await this.findOrgInvoice(tenant, invoiceId);
    if (existing.status === "CANCELLED") {
      return this.toResponse(existing);
    }
    if (existing.status === "PAID") {
      throw new BadRequestException("Paid invoices cannot be cancelled");
    }
    await this.access.assertCanAccess(tenant, existing.clientId, "manageRecords");
    const invoice = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: "CANCELLED", cancelledAt: new Date() },
      include: { client: true, items: { orderBy: { sortOrder: "asc" } } },
    });
    await this.timeline.record({
      dietitianAccountId: tenant.dietitianAccountId,
      clientId: invoice.clientId,
      type: "INVOICE_CANCELLED",
      actorUserId: tenant.userId,
      targetType: "invoice",
      targetId: invoice.id,
      metadata: { invoiceNumber: invoice.invoiceNumber },
    });
    await this.security.record({
      type: "invoice_cancelled",
      outcome: "success",
      userId: tenant.userId,
      dietitianAccountId: tenant.dietitianAccountId,
      targetType: "invoice",
      targetId: invoice.id,
    });
    return this.toResponse(invoice);
  }

  async archive(tenant: DietitianTenantContext, invoiceId: string) {
    const existing = await this.findOrgInvoice(tenant, invoiceId);
    await this.access.assertCanAccess(tenant, existing.clientId, "manageRecords");
    const invoice = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { archivedAt: new Date() },
      include: { client: true, items: { orderBy: { sortOrder: "asc" } } },
    });
    await this.security.record({
      type: "invoice_archived",
      outcome: "success",
      userId: tenant.userId,
      dietitianAccountId: tenant.dietitianAccountId,
      targetType: "invoice",
      targetId: invoice.id,
    });
    return this.toResponse(invoice);
  }

  async listPortal(client: Client) {
    const dietitianAccountId = requireDietitianAccountId(client);
    await this.refreshOverdue(dietitianAccountId);
    const rows = await this.prisma.invoice.findMany({
      where: {
        dietitianAccountId,
        clientId: client.id,
        archivedAt: null,
        status: { in: PORTAL_VISIBLE },
      },
      include: { items: { orderBy: { sortOrder: "asc" } } },
      orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
    });
    return rows.map((row) => this.toResponse(row));
  }

  async getPortal(client: Client, invoiceId: string) {
    const dietitianAccountId = requireDietitianAccountId(client);
    await this.refreshOverdue(dietitianAccountId);
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        dietitianAccountId,
        clientId: client.id,
        archivedAt: null,
        status: { in: PORTAL_VISIBLE },
      },
      include: { client: true, items: { orderBy: { sortOrder: "asc" } } },
    });
    if (!invoice) {
      throw new NotFoundException("Invoice not found");
    }
    const settings = await this.prisma.dietitianSettings.findUnique({
      where: { dietitianAccountId },
    });
    const org = await this.prisma.dietitianAccount.findUniqueOrThrow({
      where: { id: dietitianAccountId },
    });
    return {
      invoice: this.toResponse(invoice),
      practice: {
        organizationName: org.displayName,
        practiceName: settings?.practiceName ?? org.displayName,
        contactEmail: settings?.contactEmail ?? null,
        contactPhone: settings?.contactPhone ?? null,
        addressLine1: settings?.addressLine1 ?? null,
        addressLine2: settings?.addressLine2 ?? null,
        city: settings?.city ?? null,
        region: settings?.region ?? null,
        postalCode: settings?.postalCode ?? null,
        country: settings?.country ?? null,
        invoiceFooter: settings?.invoiceFooter ?? null,
        currency: settings?.currency ?? invoice.currency,
      },
    };
  }

  private async findOrgInvoice(tenant: DietitianTenantContext, invoiceId: string) {
    const visible = this.access.visibleWhere(tenant);
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, ...tenantWhere(tenant.dietitianAccountId),
        archivedAt: null,
        client: visible,
      },
      include: { client: true, items: { orderBy: { sortOrder: "asc" } } },
    });
    if (!invoice) {
      throw new NotFoundException("Invoice not found");
    }
    return invoice;
  }

  private computeItems(items: InvoiceItemInput[], totals: InvoiceTotalsInput = {}) {
    const computed = items.map((item, index) => {
      const description = item.description.trim();
      if (!description) {
        throw new BadRequestException(`Line item ${index + 1} requires a description`);
      }
      const quantity = money(item.quantity);
      const unitPrice = money(item.unitPrice);
      if (quantity.lte(0)) {
        throw new BadRequestException(`Line item ${index + 1} quantity must be positive`);
      }
      if (unitPrice.lt(0)) {
        throw new BadRequestException(`Line item ${index + 1} unit price cannot be negative`);
      }
      const lineTotal = computeLineTotal(quantity, unitPrice);
      return { description, quantity, unitPrice, lineTotal };
    });
    const subtotal = sumMoney(computed.map((item) => item.lineTotal));
    const taxRatePercent = totals.taxRatePercent == null ? 0 : Number(totals.taxRatePercent);
    if (taxRatePercent < 0 || taxRatePercent > 100) {
      throw new BadRequestException("Tax rate must be between 0 and 100");
    }
    const discountType = totals.discountType ?? null;
    const discountValue = totals.discountValue ?? null;
    if (discountType && (discountValue == null || discountValue < 0)) {
      throw new BadRequestException("Discount value must be zero or positive");
    }
    if (discountType === "PERCENT" && discountValue != null && discountValue > 100) {
      throw new BadRequestException("Percent discount cannot exceed 100");
    }
    const moneyTotals = computeInvoiceTotals({
      subtotal,
      discountType,
      discountValue,
      taxRatePercent,
    });
    return {
      items: computed,
      subtotal,
      discountType,
      discountValue: discountType && discountValue != null ? money(discountValue) : null,
      discountAmount: moneyTotals.discountAmount,
      taxRatePercent: money(taxRatePercent),
      taxAmount: moneyTotals.taxAmount,
      total: moneyTotals.total,
    };
  }

  private async refreshOverdue(dietitianAccountId: string) {
    const settings = await this.prisma.dietitianSettings.findUnique({ where: { dietitianAccountId } });
    const today = this.todayDate(settings?.timezone ?? "UTC");
    await this.prisma.invoice.updateMany({
      where: {
        dietitianAccountId,
        status: { in: ["ISSUED", "SENT"] },
        dueDate: { lt: today },
        archivedAt: null,
      },
      data: { status: "OVERDUE" },
    });
  }

  private todayDate(timezone: string): Date {
    const key = localDateKey(new Date(), timezone);
    return this.parseDate(key);
  }

  private tryParseDate(value?: string): Date | undefined {
    if (!value) return undefined;
    try {
      return this.parseDate(value);
    } catch {
      return undefined;
    }
  }

  private parseDate(value: string): Date {
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) {
      throw new RangeError("date must be YYYY-MM-DD");
    }
    return new Date(Date.UTC(year, month - 1, day));
  }

  private addDays(date: Date, days: number): Date {
    const next = new Date(date.getTime());
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  private toResponse(row: Invoice & { client?: Client; items: InvoiceItem[] }) {
    return {
      id: row.id,
      clientId: row.clientId,
      clientName: row.client
        ? row.client.displayName ?? `${row.client.firstName} ${row.client.lastName}`
        : undefined,
      invoiceNumber: row.invoiceNumber,
      status: row.status,
      issueDate: row.issueDate ? this.formatDate(row.issueDate) : null,
      dueDate: row.dueDate ? this.formatDate(row.dueDate) : null,
      currency: row.currency,
      subtotal: decimalToNumber(row.subtotal),
      discountType: row.discountType,
      discountValue: row.discountValue === null ? null : Number(row.discountValue.toString()),
      discountAmount: decimalToNumber(row.discountAmount),
      taxRatePercent: Number(row.taxRatePercent.toString()),
      taxAmount: decimalToNumber(row.taxAmount),
      total: decimalToNumber(row.total),
      notes: row.notes,
      issuedAt: row.issuedAt?.toISOString() ?? null,
      sentAt: row.sentAt?.toISOString() ?? null,
      paidAt: row.paidAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      items: row.items.map((item) => ({
        id: item.id,
        description: item.description,
        quantity: Number(item.quantity.toString()),
        unitPrice: decimalToNumber(item.unitPrice),
        lineTotal: decimalToNumber(item.lineTotal),
        sortOrder: item.sortOrder,
      })),
    };
  }

  private formatDate(value: Date): string {
    return value.toISOString().slice(0, 10);
  }
}
