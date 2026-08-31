import { FEATURE_KEYS, PLAN_FEATURE_DISPLAY_ORDER } from "@nutrition-saas/config";
import type { PrismaClient } from "@prisma/client";

export const SEEDED_PLAN_SLUGS = ["standard", "pro", "premium"] as const;

const CORE_CAPABILITIES: Array<{ key: string; name: string; description: string }> = [
  {
    key: FEATURE_KEYS.DASHBOARD,
    name: "Practice dashboard",
    description: "Clinic overview with clients, tasks, appointments, and activity.",
  },
  {
    key: FEATURE_KEYS.CLIENTS,
    name: "Client roster & charts",
    description:
      "Search, filter, and manage full client charts including clinical profile, notes, measurements, and portal connection.",
  },
  {
    key: FEATURE_KEYS.MESSAGING,
    name: "Secure messaging",
    description: "One conversation thread per client.",
  },
  {
    key: FEATURE_KEYS.MEAL_PLANS,
    name: "Meal plans",
    description: "Draft and publish meal plans to the patient portal.",
  },
  {
    key: FEATURE_KEYS.MEAL_LIBRARY,
    name: "Meal library",
    description: "Reusable meals and recipes for meal planning.",
  },
  {
    key: FEATURE_KEYS.FOODS,
    name: "Foods",
    description: "Multi-source food catalog, practice custom foods, and full nutrition facts.",
  },
  {
    key: FEATURE_KEYS.HABITS,
    name: "Habit library",
    description: "Habits for assignment and portal tracking.",
  },
  {
    key: FEATURE_KEYS.TRACKING,
    name: "Tracking review",
    description: "Review labeled food, water, exercise, sleep, and habit logs with nutrition facts.",
  },
  {
    key: FEATURE_KEYS.APPOINTMENTS,
    name: "Appointments & calendar",
    description: "Schedule visits, handle patient visit requests, and view the clinic calendar.",
  },
  {
    key: FEATURE_KEYS.ASSESSMENTS,
    name: "Custom forms",
    description: "Build questionnaires, assign them to patients, and review submitted answers.",
  },
  {
    key: FEATURE_KEYS.DOCUMENTS,
    name: "Documents",
    description: "Upload and share documents on client charts.",
  },
  {
    key: FEATURE_KEYS.INVOICES,
    name: "Invoices & quotations",
    description: "Draft quotations, issue invoices, preview the document, and print or save as PDF.",
  },
  {
    key: FEATURE_KEYS.TASKS,
    name: "Tasks",
    description: "Practice follow-ups and due work.",
  },
  {
    key: FEATURE_KEYS.ANALYTICS,
    name: "Analytics",
    description: "Practice overview and attention metrics.",
  },
];

export async function seedEntitlementCatalog(prisma: PrismaClient): Promise<void> {
  const standard = await prisma.plan.upsert({
    where: { slug: "standard" },
    update: { durationDays: 30 },
    create: {
      name: "Standard",
      slug: "standard",
      description: "Standard practice plan. AI is disabled.",
      status: "ACTIVE",
      durationDays: 30,
      showPrice: true,
    },
  });
  const pro = await prisma.plan.upsert({
    where: { slug: "pro" },
    update: { durationDays: 30 },
    create: {
      name: "Pro",
      slug: "pro",
      description: "Pro practice plan. AI enabled with a monthly request quota.",
      status: "ACTIVE",
      durationDays: 30,
      showPrice: true,
    },
  });
  const premium = await prisma.plan.upsert({
    where: { slug: "premium" },
    update: { durationDays: 30 },
    create: {
      name: "Premium",
      slug: "premium",
      description: "Premium practice plan. AI enabled with a higher monthly request quota.",
      status: "ACTIVE",
      durationDays: 30,
      showPrice: true,
    },
  });

  const capabilityFeatures = [];
  for (const capability of CORE_CAPABILITIES) {
    capabilityFeatures.push(
      await prisma.feature.upsert({
        where: { key: capability.key },
        update: { name: capability.name, description: capability.description, status: "ACTIVE" },
        create: {
          key: capability.key,
          name: capability.name,
          description: capability.description,
          valueType: "BOOLEAN",
          status: "ACTIVE",
        },
      }),
    );
  }

  const ai = await prisma.feature.upsert({
    where: { key: FEATURE_KEYS.AI },
    update: {
      name: "AI assistance",
      description: "Optional plan capability for summaries, meal-plan help, notes, and message drafts.",
      status: "ACTIVE",
    },
    create: {
      key: FEATURE_KEYS.AI,
      name: "AI assistance",
      description: "Optional plan capability for summaries, meal-plan help, notes, and message drafts.",
      valueType: "BOOLEAN",
      status: "ACTIVE",
    },
  });
  const aiLimit = await prisma.feature.upsert({
    where: { key: FEATURE_KEYS.AI_REQUEST_LIMIT },
    update: {
      name: "AI request limit",
      description: "Monthly AI request quota for the organization subscription.",
      status: "ACTIVE",
    },
    create: {
      key: FEATURE_KEYS.AI_REQUEST_LIMIT,
      name: "AI request limit",
      description: "Monthly AI request quota for the organization subscription.",
      valueType: "LIMIT",
      status: "ACTIVE",
    },
  });
  const aiTokenLimit = await prisma.feature.upsert({
    where: { key: FEATURE_KEYS.AI_TOKEN_LIMIT },
    update: {
      name: "AI token limit",
      description: "Monthly AI token budget for the organization subscription.",
      status: "ACTIVE",
    },
    create: {
      key: FEATURE_KEYS.AI_TOKEN_LIMIT,
      name: "AI token limit",
      description: "Monthly AI token budget for the organization subscription.",
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

  const planIds = [standard.id, pro.id, premium.id];
  const rows: Array<{
    planId: string;
    featureId: string;
    enabled: boolean;
    limitValue: number | null;
  }> = [];

  for (const planId of planIds) {
    for (const feature of capabilityFeatures) {
      rows.push({ planId, featureId: feature.id, enabled: true, limitValue: null });
    }
  }

  rows.push(
    { planId: standard.id, featureId: ai.id, enabled: false, limitValue: null },
    { planId: standard.id, featureId: aiLimit.id, enabled: false, limitValue: 0 },
    { planId: standard.id, featureId: aiTokenLimit.id, enabled: false, limitValue: 0 },
    { planId: standard.id, featureId: clientLimit.id, enabled: true, limitValue: 25 },
    { planId: standard.id, featureId: automation.id, enabled: false, limitValue: null },
    { planId: standard.id, featureId: automationRuleLimit.id, enabled: false, limitValue: 0 },
    { planId: standard.id, featureId: automationExecutionLimit.id, enabled: false, limitValue: 0 },
    { planId: pro.id, featureId: ai.id, enabled: true, limitValue: null },
    { planId: pro.id, featureId: aiLimit.id, enabled: true, limitValue: 300 },
    { planId: pro.id, featureId: aiTokenLimit.id, enabled: true, limitValue: 1_500_000 },
    { planId: pro.id, featureId: clientLimit.id, enabled: true, limitValue: 100 },
    { planId: pro.id, featureId: automation.id, enabled: true, limitValue: null },
    { planId: pro.id, featureId: automationRuleLimit.id, enabled: true, limitValue: 25 },
    { planId: pro.id, featureId: automationExecutionLimit.id, enabled: true, limitValue: 2000 },
    { planId: premium.id, featureId: ai.id, enabled: true, limitValue: null },
    { planId: premium.id, featureId: aiLimit.id, enabled: true, limitValue: 1000 },
    { planId: premium.id, featureId: aiTokenLimit.id, enabled: true, limitValue: 5_000_000 },
    { planId: premium.id, featureId: clientLimit.id, enabled: true, limitValue: 300 },
    { planId: premium.id, featureId: automation.id, enabled: true, limitValue: null },
    { planId: premium.id, featureId: automationRuleLimit.id, enabled: true, limitValue: 100 },
    { planId: premium.id, featureId: automationExecutionLimit.id, enabled: true, limitValue: 10000 },
  );

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

export function sortPlanFeaturesForDisplay<T extends { key: string }>(features: T[]): T[] {
  return [...features].sort((a, b) => {
    const ai = PLAN_FEATURE_DISPLAY_ORDER.indexOf(a.key);
    const bi = PLAN_FEATURE_DISPLAY_ORDER.indexOf(b.key);
    if (ai === -1 && bi === -1) return a.key.localeCompare(b.key);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}
