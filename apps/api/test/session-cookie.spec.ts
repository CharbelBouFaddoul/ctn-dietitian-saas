import { describe, expect, it } from "vitest";
import { isCookieSecure, sessionCookieOptions } from "../src/auth/session-cookie";

describe("session cookie options", () => {
  it("is httpOnly, lax, path=/, and secure in production", () => {
    const production = sessionCookieOptions({
      NODE_ENV: "production",
      SESSION_TTL_SECONDS: 3600,
    });
    expect(production.httpOnly).toBe(true);
    expect(production.secure).toBe(true);
    expect(production.sameSite).toBe("lax");
    expect(production.path).toBe("/");
    expect(production.maxAge).toBe(3_600_000);
    expect(isCookieSecure({ NODE_ENV: "development", SESSION_TTL_SECONDS: 1 })).toBe(false);
    expect(isCookieSecure({ NODE_ENV: "development", COOKIE_SECURE: "true", SESSION_TTL_SECONDS: 1 })).toBe(
      true,
    );
  });
});
