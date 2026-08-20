import { Injectable, Logger } from "@nestjs/common";
import type { AuditResult, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { sanitizeAuditMetadata } from "./audit-sanitize";

export type SecurityEventOutcome = "success" | "failure";

export interface SecurityEvent {
  type: string;
  outcome: SecurityEventOutcome;
  userId?: string;
  organizationId?: string;
  dietitianAccountId?: string;
  emailNormalized?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  targetType?: string;
  targetId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class SecurityEventLogger {
  private readonly logger = new Logger(SecurityEventLogger.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(event: SecurityEvent): Promise<void> {
    this.logger.log(
      JSON.stringify({
        type: event.type,
        outcome: event.outcome,
        userId: event.userId,
        organizationId: event.organizationId,
        dietitianAccountId: event.dietitianAccountId,
        reason: event.reason,
        at: new Date().toISOString(),
      }),
    );

    try {
      await this.persist(event);
    } catch (error) {
      this.logger.error(
        `Failed to persist audit log for ${event.type}: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }

  private async persist(event: SecurityEvent): Promise<void> {
    const metadata = sanitizeAuditMetadata({
      ...(event.metadata ?? {}),
      ...(event.reason ? { reason: event.reason } : {}),
      ...(event.emailNormalized ? { emailNormalized: event.emailNormalized } : {}),
    });

    const dietitianAccountId = event.dietitianAccountId ?? event.organizationId ?? null;
    await this.prisma.auditLog.create({
      data: {
        actorUserId: event.userId ?? null,
        organizationId: event.organizationId ?? null,
        dietitianAccountId,
        action: event.type,
        targetType: event.targetType ?? this.inferTargetType(event),
        targetId: event.targetId ?? dietitianAccountId ?? event.userId ?? null,
        requestId: event.requestId ?? null,
        result: this.toResult(event.outcome),
        metadata: metadata as Prisma.InputJsonObject,
        ip: event.ipAddress ?? null,
        userAgent: event.userAgent ?? null,
      },
    });
  }

  private toResult(outcome: SecurityEventOutcome): AuditResult {
    return outcome === "success" ? "SUCCESS" : "FAILURE";
  }

  private inferTargetType(event: SecurityEvent): string | null {
    if (event.dietitianAccountId || event.organizationId) {
      return "dietitian_account";
    }
    if (event.userId) {
      return "user";
    }
    return null;
  }
}
