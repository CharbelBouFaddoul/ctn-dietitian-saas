import { Injectable, Logger } from "@nestjs/common";
import { localDateKey } from "@nutrition-saas/utilities";
import { PrismaService } from "../prisma/prisma.service";
import { AutomationEvaluatorService } from "./automation-evaluator.service";
import { AutomationExecutorService } from "./automation-executor.service";

@Injectable()
export class AutomationSweepService {
  private readonly logger = new Logger(AutomationSweepService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evaluator: AutomationEvaluatorService,
    private readonly executor: AutomationExecutorService,
  ) {}

  async runSweep(): Promise<{ rulesProcessed: number; candidatesExecuted: number }> {
    const rules = await this.prisma.automationRule.findMany({
      where: { status: "ACTIVE", archivedAt: null, organization: { status: "ACTIVE" } },
      include: { organization: { include: { settings: true } } },
    });

    let candidatesExecuted = 0;
    for (const rule of rules) {
      const timezone = rule.organization.settings?.timezone ?? "UTC";
      const localDate = localDateKey(new Date(), timezone);
      const candidates = await this.evaluator.findCandidates(rule, timezone, localDate);
      for (const candidate of candidates) {
        await this.executor.executeCandidate(rule, candidate);
        candidatesExecuted += 1;
      }
    }

    this.logger.log(`Automation sweep processed ${rules.length} rules, ${candidatesExecuted} candidates`);
    return { rulesProcessed: rules.length, candidatesExecuted };
  }
}
