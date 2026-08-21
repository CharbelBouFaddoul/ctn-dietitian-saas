import { ForbiddenException } from "@nestjs/common";
import { AUTH_MESSAGES } from "../auth/auth.messages";
import type { PrismaService } from "../prisma/prisma.service";
import { PLATFORM_SETTINGS_SINGLETON_ID } from "./platform-settings.defaults";

export type RegistrationAudience = "dietitian" | "patient";

export async function assertRegistrationEnabled(
  prisma: PrismaService,
  audience: RegistrationAudience = "dietitian",
): Promise<void> {
  const row = await prisma.platformSettings.findUnique({
    where: { id: PLATFORM_SETTINGS_SINGLETON_ID },
    select: {
      dietitianRegistrationEnabled: true,
      patientRegistrationEnabled: true,
    },
  });
  const enabled =
    audience === "patient"
      ? row?.patientRegistrationEnabled
      : row?.dietitianRegistrationEnabled;
  if (!enabled) {
    throw new ForbiddenException(AUTH_MESSAGES.registrationDisabled);
  }
}
