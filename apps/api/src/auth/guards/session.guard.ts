import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SESSION_COOKIE_NAME } from "@nutrition-saas/config";
import type { AppEnv } from "@nutrition-saas/validation";
import type { Request, Response } from "express";
import { requestIp, requestUserAgent } from "../../common/request-meta";
import { AUTH_MESSAGES } from "../auth.messages";
import { SessionService } from "../session.service";
import { clearSessionCookie, type CookieSettings } from "../session-cookie";

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const rawToken = req.cookies?.[SESSION_COOKIE_NAME];

    if (typeof rawToken !== "string" || rawToken.length === 0) {
      throw new UnauthorizedException(AUTH_MESSAGES.authenticationRequired);
    }

    const session = await this.sessions.validate(rawToken, {
      ipAddress: requestIp(req),
      userAgent: requestUserAgent(req),
    });

    if (!session) {
      clearSessionCookie(res, this.cookieSettings());
      throw new UnauthorizedException(AUTH_MESSAGES.authenticationRequired);
    }

    req.user = this.sessions.toAuthenticatedUser(session.user);
    req.authSession = this.sessions.toAuthenticatedSession(session);
    return true;
  }

  private cookieSettings(): CookieSettings {
    return {
      NODE_ENV: this.config.get("NODE_ENV", { infer: true }),
      COOKIE_SECURE: this.config.get("COOKIE_SECURE", { infer: true }),
      SESSION_TTL_SECONDS: this.config.get("SESSION_TTL_SECONDS", { infer: true }),
    };
  }
}
