import type { Request } from "express";

export function requestIp(req: Request): string | undefined {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]?.trim();
  }
  return req.ip;
}

export function requestUserAgent(req: Request): string | undefined {
  const value = req.headers["user-agent"];
  return typeof value === "string" ? value.slice(0, 512) : undefined;
}
