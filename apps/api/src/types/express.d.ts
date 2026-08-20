import type { AuthenticatedRequestUser, AuthenticatedSession } from "../auth/auth.types";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";
import type { Client } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedRequestUser;
      authSession?: AuthenticatedSession;
      tenant?: DietitianTenantContext;
      requestId?: string;
      client?: Client;
    }
  }
}

export {};
