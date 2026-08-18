import type { Response } from "express";
import { SESSION_COOKIE_NAME } from "@nutrition-saas/config";
import type { AppEnv } from "@nutrition-saas/validation";

export type CookieSettings = Pick<AppEnv, "NODE_ENV" | "COOKIE_SECURE" | "SESSION_TTL_SECONDS">;

export function isCookieSecure(env: CookieSettings): boolean {
  if (env.COOKIE_SECURE === "true") {
    return true;
  }
  if (env.COOKIE_SECURE === "false") {
    return false;
  }
  return env.NODE_ENV === "production";
}

export function sessionCookieOptions(env: CookieSettings) {
  return {
    httpOnly: true,
    secure: isCookieSecure(env),
    sameSite: "lax" as const,
    path: "/",
    maxAge: env.SESSION_TTL_SECONDS * 1000,
  };
}

export function setSessionCookie(res: Response, rawToken: string, env: CookieSettings): void {
  res.cookie(SESSION_COOKIE_NAME, rawToken, sessionCookieOptions(env));
}

export function clearSessionCookie(res: Response, env: CookieSettings): void {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: isCookieSecure(env),
    sameSite: "lax",
    path: "/",
  });
}
