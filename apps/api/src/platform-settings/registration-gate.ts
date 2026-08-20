import { ForbiddenException } from "@nestjs/common";
import { AUTH_MESSAGES } from "../auth/auth.messages";
import type { PrismaService } from "../prisma/prisma.service";
import { PLATFORM_SETTINGS_SINGLETON_ID } from "./platform-settings.defaults";

export async function assertRegistrationEnabled(prisma: PrismaService): Promise<void> {
  const row = await prisma.platformSettings.findUnique({
    where: { id: PLATFORM_SETTINGS_SINGLETON_ID },
    select: { registrationEnabled: true },
  });
  if (!row?.registrationEnabled) {
    throw new ForbiddenException(AUTH_MESSAGES.registrationDisabled);
  }
}
