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

interface OrgRow {
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
  organizationIds: string[];
  hasPortal: boolean;
  audience?: SessionAudience;
}): SessionHome {
  if (input.platformRole === "ADMIN" || input.platformRole === "SUPER_ADMIN") {
    return { kind: "admin", path: "/admin" };
  }
  if (input.audience === "client") {
    if (input.organizationIds.length >= 1) {
      const organizationId = input.organizationIds[0];
      if (organizationId) {
        return { kind: "dietitian", path: `/practice/${organizationId}` };
      }
    }
    return { kind: "client", path: input.hasPortal ? "/client" : "/client/join" };
  }
  if (input.organizationIds.length >= 1) {
    const organizationId = input.organizationIds[0];
    if (organizationId) {
      return { kind: "dietitian", path: `/practice/${organizationId}` };
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
    if (err instanceof ApiError && err.status === 401) {
      return { kind: "unauthenticated", path: "/" };
    }
    throw err;
  }

  let organizationIds: string[] = [];
  try {
    const orgs = await api<OrgRow[]>("/api/v1/organizations");
    organizationIds = orgs.map((org) => org.id);
  } catch (err) {
    if (!(err instanceof ApiError && (err.status === 401 || err.status === 403))) {
      throw err;
    }
  }

  let hasPortal = false;
  if (organizationIds.length === 0 && !me.user.platformRole) {
    try {
      const onboarding = await api<PortalOnboarding>("/api/v1/portal/onboarding");
      hasPortal = onboarding.status === "connected";
    } catch (err) {
      if (!(err instanceof ApiError && (err.status === 401 || err.status === 403))) {
        throw err;
      }
    }
  }

  return pickSessionHome({
    platformRole: me.user.platformRole,
    organizationIds,
    hasPortal,
    audience,
  });
}
