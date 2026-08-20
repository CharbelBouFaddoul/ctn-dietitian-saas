import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "@nutrition-saas/validation";

@Injectable()
export class TokenService {
  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  generateRawToken(): string {
    return randomBytes(32).toString("base64url");
  }

  generateJoinCode(): { display: string; normalized: string } {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = randomBytes(8);
    const chars = [...bytes].map((byte) => alphabet[byte % 32]).join("");
    return { display: `${chars.slice(0, 4)}-${chars.slice(4)}`, normalized: chars };
  }

  normalizeJoinCode(value: string): string {
    return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  hashToken(rawToken: string): string {
    return createHmac("sha256", this.config.get("AUTH_TOKEN_SECRET", { infer: true }))
      .update(rawToken)
      .digest("hex");
  }

  issue(): { rawToken: string; tokenHash: string } {
    const rawToken = this.generateRawToken();
    return { rawToken, tokenHash: this.hashToken(rawToken) };
  }

  hashedEquals(leftHex: string, rightHex: string): boolean {
    const left = Buffer.from(leftHex, "hex");
    const right = Buffer.from(rightHex, "hex");
    if (left.length !== right.length) {
      return false;
    }
    return timingSafeEqual(left, right);
  }
}
