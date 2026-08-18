import {
  BadRequestException,
  Injectable,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "@nutrition-saas/validation";
import * as argon2 from "argon2";
import { AUTH_MESSAGES } from "./auth.messages";

const PASSWORD_MAX_LENGTH = 128;

@Injectable()
export class PasswordService implements OnModuleInit {
  private dummyHash = "";

  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  async onModuleInit(): Promise<void> {
    this.dummyHash = await this.hash("timing-dummy-password");
  }

  minLength(): number {
    return this.config.get("PASSWORD_MIN_LENGTH", { infer: true });
  }

  assertPolicy(password: string): void {
    if (password.length < this.minLength()) {
      throw new BadRequestException(AUTH_MESSAGES.passwordTooShort);
    }
    if (password.length > PASSWORD_MAX_LENGTH) {
      throw new BadRequestException(AUTH_MESSAGES.passwordTooLong);
    }
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      throw new BadRequestException(AUTH_MESSAGES.passwordComplexity);
    }
  }

  async hash(password: string): Promise<string> {
    return argon2.hash(password, this.hashOptions());
  }

  async verify(password: string, passwordHash: string | null): Promise<boolean> {
    const target = passwordHash ?? this.dummyHash;
    try {
      const matches = await argon2.verify(target, password);
      return passwordHash !== null && matches;
    } catch {
      return false;
    }
  }

  isArgon2idHash(value: string): boolean {
    return value.startsWith("$argon2id$");
  }

  private hashOptions(): argon2.Options {
    const test = this.config.get("NODE_ENV", { infer: true }) === "test";
    return {
      type: argon2.argon2id,
      memoryCost: test ? 4096 : 19456,
      timeCost: 2,
      parallelism: 1,
    };
  }
}
