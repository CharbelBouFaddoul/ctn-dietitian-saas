import { FEATURE_KEYS } from "@nutrition-saas/config";
import type { PrismaClient } from "@prisma/client";

export const SEEDED_PLAN_SLUGS = ["standard", "pro", "premium"] as const;

export async function seedEntitlementCatalog(prisma: PrismaClient): Promise<void> {
  const standard = await prisma.plan.upsert({
    where: { slug: "standard" },
    update: {},
    create: {
      name: "Standard",
      slug: "standard",
      description: "Standard practice plan. AI is disabled.",
      status: "ACTIVE",
    },
  });
  const pro = await prisma.plan.upsert({
    where: { slug: "pro" },
    update: {},
    create: {
      name: "Pro",
      slug: "pro",
      description: "Pro practice plan. AI enabled with a monthly request quota.",
      status: "ACTIVE",
    },
  });
  const premium = await prisma.plan.upsert({
    where: { slug: "premium" },
    update: {},
    create: {
      name: "Premium",
      slug: "premium",
      description: "Premium practice plan. AI enabled with a higher monthly request quota.",
      status: "ACTIVE",
    },
  });

  const ai = await prisma.feature.upsert({
    where: { key: FEATURE_KEYS.AI },
    update: {},
    create: {
      key: FEATURE_KEYS.AI,
      name: "AI",
      description: "Unified AI capability. Not a separate subscription.",
      valueType: "BOOLEAN",
      status: "ACTIVE",
    },
  });
  const aiLimit = await prisma.feature.upsert({
    where: { key: FEATURE_KEYS.AI_REQUEST_LIMIT },
    update: {},
    create: {
      key: FEATURE_KEYS.AI_REQUEST_LIMIT,
      name: "AI request limit",
      description: "Monthly AI request quota for the organization subscription.",
      valueType: "LIMIT",
      status: "ACTIVE",
    },
  });
  const clientLimit = await prisma.feature.upsert({
    where: { key: FEATURE_KEYS.CLIENT_LIMIT },
    update: {},
    create: {
      key: FEATURE_KEYS.CLIENT_LIMIT,
      name: "Client limit",
      description: "Maximum active/pending clients for the organization. Null plan limit means unlimited.",
      valueType: "LIMIT",
      status: "ACTIVE",
    },
  });
  const automation = await prisma.feature.upsert({
    where: { key: FEATURE_KEYS.AUTOMATION },
    update: {},
    create: {
      key: FEATURE_KEYS.AUTOMATION,
      name: "Automation",
      description: "Practice automation rules and scheduled actions.",
      valueType: "BOOLEAN",
      status: "ACTIVE",
    },
  });
  const automationRuleLimit = await prisma.feature.upsert({
    where: { key: FEATURE_KEYS.AUTOMATION_RULE_LIMIT },
    update: {},
    create: {
      key: FEATURE_KEYS.AUTOMATION_RULE_LIMIT,
      name: "Automation rule limit",
      description: "Maximum active automation rules per organization.",
      valueType: "LIMIT",
      status: "ACTIVE",
    },
  });
  const automationExecutionLimit = await prisma.feature.upsert({
    where: { key: FEATURE_KEYS.AUTOMATION_EXECUTION_LIMIT },
    update: {},
    create: {
      key: FEATURE_KEYS.AUTOMATION_EXECUTION_LIMIT,
      name: "Automation execution limit",
      description: "Maximum automation executions per organization per month.",
      valueType: "LIMIT",
      status: "ACTIVE",
    },
  });

  const rows: Array<{
    planId: string;
    featureId: string;
    enabled: boolean;
    limitValue: number | null;
  }> = [
    { planId: standard.id, featureId: ai.id, enabled: false, limitValue: null },
    { planId: standard.id, featureId: aiLimit.id, enabled: false, limitValue: 0 },
    { planId: standard.id, featureId: clientLimit.id, enabled: true, limitValue: null },
    { planId: standard.id, featureId: automation.id, enabled: false, limitValue: null },
    { planId: standard.id, featureId: automationRuleLimit.id, enabled: false, limitValue: 0 },
    { planId: standard.id, featureId: automationExecutionLimit.id, enabled: false, limitValue: 0 },
    { planId: pro.id, featureId: ai.id, enabled: true, limitValue: null },
    { planId: pro.id, featureId: aiLimit.id, enabled: true, limitValue: 300 },
    { planId: pro.id, featureId: clientLimit.id, enabled: true, limitValue: null },
    { planId: pro.id, featureId: automation.id, enabled: true, limitValue: null },
    { planId: pro.id, featureId: automationRuleLimit.id, enabled: true, limitValue: 25 },
    { planId: pro.id, featureId: automationExecutionLimit.id, enabled: true, limitValue: 2000 },
    { planId: premium.id, featureId: ai.id, enabled: true, limitValue: null },
    { planId: premium.id, featureId: aiLimit.id, enabled: true, limitValue: 1000 },
    { planId: premium.id, featureId: clientLimit.id, enabled: true, limitValue: null },
    { planId: premium.id, featureId: automation.id, enabled: true, limitValue: null },
    { planId: premium.id, featureId: automationRuleLimit.id, enabled: true, limitValue: 100 },
    { planId: premium.id, featureId: automationExecutionLimit.id, enabled: true, limitValue: 10000 },
  ];

  for (const row of rows) {
    await prisma.planFeature.upsert({
      where: {
        planId_featureId: { planId: row.planId, featureId: row.featureId },
      },
      update: { enabled: row.enabled, limitValue: row.limitValue },
      create: row,
    });
  }
}
