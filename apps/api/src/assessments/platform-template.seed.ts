import type { PrismaClient } from "@prisma/client";

export const PLATFORM_ASSESSMENT_TEMPLATE_ID = "a3000000-0000-4000-8000-000000000001";

export async function seedPlatformAssessmentTemplate(prisma: PrismaClient): Promise<void> {
  await prisma.assessmentTemplate.upsert({
    where: { id: PLATFORM_ASSESSMENT_TEMPLATE_ID },
    update: {},
    create: {
      id: PLATFORM_ASSESSMENT_TEMPLATE_ID,
      organizationId: null,
      name: "Initial nutrition assessment",
      description:
        "Platform template. Completing an assessment stores this version so later template edits do not rewrite history.",
      status: "ACTIVE",
      version: 1,
      schema: {
        sections: [
          {
            id: "context",
            title: "Nutrition context",
            fields: [
              { id: "reason", label: "Reason for visit", type: "text" },
              { id: "allergies", label: "Allergies", type: "text" },
              { id: "preferences", label: "Dietary preferences", type: "text" },
              { id: "goals", label: "Goals", type: "text" },
            ],
          },
        ],
      },
    },
  });
}
