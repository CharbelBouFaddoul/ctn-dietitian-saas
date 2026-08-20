import type { PrismaClient } from "@prisma/client";

export const PLATFORM_ASSESSMENT_TEMPLATE_ID = "a3000000-0000-4000-8000-000000000001";

/**
 * Platform-wide assessment templates use null dietitianAccountId.
 * Phase 7 requires dietitianAccountId on AssessmentTemplate, so shared platform seeding is disabled.
 * Practice-specific templates are created via AssessmentService.createTemplate.
 */
export async function seedPlatformAssessmentTemplate(_prisma: PrismaClient): Promise<void> {
  return;
}
