import { ApiError, api } from "./api";

export type SessionKind = "unauthenticated" | "admin" | "dietitian" | "client";
export type SessionAudience = "admin" | "dietitian" | "client";

export interface SessionHome {
  kind: SessionKind;
  path: string;
}

interface AuthMe {
  user: { platformRole: string | null };
}

interface DietitianAccountRow {
  id: string;
}

interface PortalOnboarding {
  status: "needs_join" | "connected";
}

export function loginPathFor(kind: Exclude<SessionKind, "unauthenticated">): string {
  if (kind === "admin") return "/admin/login";
  if (kind === "client") return "/auth/client/login";
  return "/auth/dietitian/login";
}

export function pickSessionHome(input: {
  platformRole: string | null;
  dietitianAccountIds: string[];
  hasPortal: boolean;
  audience?: SessionAudience;
}): SessionHome {
  if (input.platformRole === "ADMIN" || input.platformRole === "SUPER_ADMIN") {
    return { kind: "admin", path: "/admin" };
  }
  if (input.audience === "client") {
    if (input.dietitianAccountIds.length >= 1) {
      const dietitianAccountId = input.dietitianAccountIds[0];
      if (dietitianAccountId) {
        return { kind: "dietitian", path: `/practice/${dietitianAccountId}` };
      }
    }
    return { kind: "client", path: input.hasPortal ? "/client" : "/client/join" };
  }
  if (input.dietitianAccountIds.length >= 1) {
    const dietitianAccountId = input.dietitianAccountIds[0];
    if (dietitianAccountId) {
      return { kind: "dietitian", path: `/practice/${dietitianAccountId}` };
    }
  }
  if (input.hasPortal) {
    return { kind: "client", path: "/client" };
  }
  return { kind: "dietitian", path: "/practice" };
}

export async function resolveSessionHome(audience?: SessionAudience): Promise<SessionHome> {
  let me: AuthMe;
  try {
    me = await api<AuthMe>("/api/v1/auth/me");
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 0)) {
      return { kind: "unauthenticated", path: "/" };
    }
    throw err;
  }

  let dietitianAccountIds: string[] = [];
  try {
    const accounts = await api<DietitianAccountRow[]>("/api/v1/dietitian");
    dietitianAccountIds = accounts.map((account) => account.id);
  } catch (err) {
    if (!(err instanceof ApiError && (err.status === 401 || err.status === 403 || err.status === 0))) {
      throw err;
    }
  }

  let hasPortal = false;
  if (dietitianAccountIds.length === 0 && !me.user.platformRole) {
    try {
      const onboarding = await api<PortalOnboarding>("/api/v1/portal/onboarding");
      hasPortal = onboarding.status === "connected";
    } catch (err) {
      if (!(err instanceof ApiError && (err.status === 401 || err.status === 403 || err.status === 0))) {
        throw err;
      }
    }
  }

  return pickSessionHome({
    platformRole: me.user.platformRole,
    dietitianAccountIds,
    hasPortal,
    audience,
  });
}
