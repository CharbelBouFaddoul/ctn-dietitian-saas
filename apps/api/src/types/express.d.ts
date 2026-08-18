import type { AuthenticatedRequestUser, AuthenticatedSession } from "../auth/auth.types";
import type { TenantContext } from "../organizations/tenant.types";
import type { Client } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedRequestUser;
      authSession?: AuthenticatedSession;
      tenant?: TenantContext;
      requestId?: string;
      client?: Client;
    }
  }
}

export {};
