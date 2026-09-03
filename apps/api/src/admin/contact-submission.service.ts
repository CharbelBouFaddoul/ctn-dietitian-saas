import { Injectable, NotFoundException } from "@nestjs/common";
import type { ContactSubmission, ContactSubmissionStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ADMIN_MESSAGES } from "./admin.messages";

const PREVIEW_LENGTH = 140;

type ListQuery = {
  q?: string;
  status?: "inbox" | "NEW" | "READ" | "ARCHIVED" | "all";
  page?: number;
  pageSize?: number;
};

type CreateInput = {
  name: string;
  email: string;
  subject: string;
  message: string;
  planSlug?: string;
  ip?: string;
  userAgent?: string;
};

function previewText(message: string): string {
  const compact = message.replace(/\s+/g, " ").trim();
  if (compact.length <= PREVIEW_LENGTH) return compact;
  return `${compact.slice(0, PREVIEW_LENGTH - 1).trimEnd()}…`;
}

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function toListItem(row: ContactSubmission) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    subject: row.subject,
    preview: previewText(row.message),
    messageLength: row.message.length,
    status: row.status,
    planSlug: row.planSlug,
    planName: row.planName,
    createdAt: row.createdAt.toISOString(),
  };
}

function toDetail(row: ContactSubmission) {
  return {
    ...toListItem(row),
    message: row.message,
    ip: row.ip,
    userAgent: row.userAgent,
    readAt: toIso(row.readAt),
    archivedAt: toIso(row.archivedAt),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class ContactSubmissionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateInput) {
    const planSlug = input.planSlug?.trim() || null;
    let planName: string | null = null;
    if (planSlug) {
      const plan = await this.prisma.plan.findUnique({
        where: { slug: planSlug },
        select: { name: true },
      });
      planName = plan?.name ?? null;
    }

    const row = await this.prisma.contactSubmission.create({
      data: {
        name: input.name.trim(),
        email: input.email.trim(),
        subject: input.subject.trim(),
        message: input.message.trim(),
        planSlug,
        planName,
        ip: input.ip?.slice(0, 80) || null,
        userAgent: input.userAgent || null,
      },
    });

    return { id: row.id, createdAt: row.createdAt.toISOString() };
  }

  async list(query: ListQuery = {}) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const statusFilter = query.status ?? "inbox";
    const filters: Prisma.ContactSubmissionWhereInput[] = [];

    if (query.q) {
      const q = query.q.trim();
      filters.push({
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { subject: { contains: q, mode: "insensitive" } },
          { message: { contains: q, mode: "insensitive" } },
        ],
      });
    }

    if (statusFilter === "inbox") {
      filters.push({ status: { in: ["NEW", "READ"] } });
    } else if (statusFilter === "NEW" || statusFilter === "READ" || statusFilter === "ARCHIVED") {
      filters.push({ status: statusFilter });
    }

    const where: Prisma.ContactSubmissionWhereInput = filters.length > 0 ? { AND: filters } : {};

    const [total, items, newCount] = await this.prisma.$transaction([
      this.prisma.contactSubmission.count({ where }),
      this.prisma.contactSubmission.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.contactSubmission.count({ where: { status: "NEW" } }),
    ]);

    return {
      page,
      pageSize,
      total,
      newCount,
      items: items.map(toListItem),
    };
  }

  async get(id: string) {
    const row = await this.prisma.contactSubmission.findUnique({ where: { id } });
    if (!row) throw new NotFoundException(ADMIN_MESSAGES.contactSubmissionNotFound);
    return toDetail(row);
  }

  async updateStatus(id: string, status: ContactSubmissionStatus) {
    const existing = await this.prisma.contactSubmission.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(ADMIN_MESSAGES.contactSubmissionNotFound);

    const now = new Date();
    const row = await this.prisma.contactSubmission.update({
      where: { id },
      data: {
        status,
        readAt: status === "NEW" ? null : existing.readAt ?? now,
        archivedAt: status === "ARCHIVED" ? now : null,
      },
    });
    return toDetail(row);
  }

  async remove(id: string) {
    const existing = await this.prisma.contactSubmission.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(ADMIN_MESSAGES.contactSubmissionNotFound);
    await this.prisma.contactSubmission.delete({ where: { id } });
    return { ok: true };
  }
}
