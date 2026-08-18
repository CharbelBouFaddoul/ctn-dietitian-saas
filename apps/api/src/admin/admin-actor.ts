import type { Request } from "express";
import { requestIp, requestUserAgent } from "../common/request-meta";
import type { AuthenticatedRequestUser } from "../auth/auth.types";

export interface AdminActor {
  userId: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

export function adminActor(user: AuthenticatedRequestUser, req: Request): AdminActor {
  return {
    userId: user.id,
    ipAddress: requestIp(req),
    userAgent: requestUserAgent(req),
    requestId: req.requestId,
  };
}
