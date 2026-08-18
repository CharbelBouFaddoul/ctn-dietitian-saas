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
