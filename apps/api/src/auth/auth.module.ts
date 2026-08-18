import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { ConsentService } from "./consent.service";
import { EmailVerificationService } from "./email-verification.service";
import { SessionGuard } from "./guards/session.guard";
import { InvitationService } from "./invitation.service";
import { PasswordResetService } from "./password-reset.service";
import { PasswordService } from "./password.service";
import { SecurityEventLogger } from "./security-event.logger";
import { SessionService } from "./session.service";
import { TokenService } from "./token.service";

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionService,
    PasswordService,
    TokenService,
    EmailVerificationService,
    PasswordResetService,
    InvitationService,
    ConsentService,
    SessionGuard,
    SecurityEventLogger,
  ],
  exports: [
    AuthService,
    SessionService,
    PasswordService,
    TokenService,
    EmailVerificationService,
    PasswordResetService,
    InvitationService,
    ConsentService,
    SessionGuard,
    SecurityEventLogger,
  ],
})
export class AuthModule {}
