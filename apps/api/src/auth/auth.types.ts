import type { PlatformRole, UserStatus } from "@nutrition-saas/types";

export interface AuthenticatedRequestUser {
  id: string;
  email: string;
  emailNormalized: string;
  status: UserStatus;
  platformRole: PlatformRole | null;
  emailVerifiedAt: Date | null;
  createdAt: Date;
}

export interface AuthenticatedSession {
  id: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  lastUsedAt: Date;
}

export interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}
