import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class InvoiceNumberService {
  constructor(private readonly prisma: PrismaService) {}

  /** Phase 1: organizationId argument is DietitianAccount.id */
  async allocate(dietitianAccountId: string, tx?: Prisma.TransactionClient): Promise<string> {
    const client = tx ?? this.prisma;
    const rows = await client.$queryRaw<{ allocated: number }[]>`
      INSERT INTO invoice_sequences (dietitian_account_id, organization_id, next_number, updated_at)
      VALUES (${dietitianAccountId}::uuid, ${dietitianAccountId}::uuid, 2, NOW())
      ON CONFLICT (dietitian_account_id) DO UPDATE
      SET next_number = invoice_sequences.next_number + 1, updated_at = NOW()
      RETURNING invoice_sequences.next_number - 1 AS allocated
    `;
    const allocated = rows[0]?.allocated ?? 1;
    return `INV-${String(allocated).padStart(6, "0")}`;
  }
}
