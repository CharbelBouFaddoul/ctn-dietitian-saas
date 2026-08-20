import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SkipThrottle, Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { THROTTLE_NAMES } from "@nutrition-saas/config";
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { SESSION_COOKIE_NAME } from "@nutrition-saas/config";
import type { AppEnv } from "@nutrition-saas/validation";
import { normalizeEmail } from "@nutrition-saas/utilities";
import type { Request, Response } from "express";
import { requestIp, requestUserAgent } from "../common/request-meta";
import { AUTH_MESSAGES } from "./auth.messages";
import { AuthService } from "./auth.service";
import type { AuthenticatedRequestUser, AuthenticatedSession } from "./auth.types";
import { CurrentSession, CurrentUser } from "./decorators/current-user.decorator";
import { EmailDto } from "./dto/email.dto";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { AcceptInvitationDto } from "./dto/accept-invitation.dto";
import {
  AuthMeResponseDto,
  MessageResponseDto,
  UnauthorizedErrorResponseDto,
  ValidationErrorResponseDto,
} from "./dto/responses.dto";
import { TokenDto } from "./dto/token.dto";
import { EmailVerificationService } from "./email-verification.service";
import { SessionGuard } from "./guards/session.guard";
import { PasswordResetService } from "./password-reset.service";
import { SessionService } from "./session.service";
import { clearSessionCookie, setSessionCookie, type CookieSettings } from "./session-cookie";

@ApiTags("auth")
@UseGuards(ThrottlerGuard)
@Throttle({ [THROTTLE_NAMES.AUTH]: {} })
@ApiTooManyRequestsResponse({ description: "Too many requests from this IP" })
@Controller("api/v1/auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly verification: EmailVerificationService,
    private readonly passwordReset: PasswordResetService,
    private readonly sessions: SessionService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  @Post("register")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Register an identity",
    description:
      "Creates a PENDING user and sends a verification email. Always returns a generic message so callers cannot enumerate accounts. Does not create organizations or client records.",
  })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiBadRequestResponse({ type: ValidationErrorResponseDto })
  async register(
    @Body() body: RegisterDto,
    @Req() req: Request,
  ): Promise<MessageResponseDto> {
    await this.auth.register(body, this.meta(req));
    return { message: AUTH_MESSAGES.register };
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Sign in",
    description:
      "Verifies email/password and sets an httpOnly session cookie. Failed attempts always use the same error message.",
  })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiUnauthorizedResponse({ type: UnauthorizedErrorResponseDto })
  @ApiBadRequestResponse({ type: ValidationErrorResponseDto })
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MessageResponseDto> {
    const { rawToken } = await this.auth.login(body.email, body.password, this.meta(req));
    setSessionCookie(res, rawToken, this.cookieSettings());
    return { message: "Signed in" };
  }

  @Post("logout")
  @SkipThrottle({ [THROTTLE_NAMES.AUTH]: true })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Sign out",
    description: "Revokes the current session when a valid cookie is present and always clears the cookie.",
  })
  @ApiOkResponse({ type: MessageResponseDto })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MessageResponseDto> {
    const rawToken = req.cookies?.[SESSION_COOKIE_NAME];
    if (typeof rawToken === "string" && rawToken.length > 0) {
      const userId = await this.sessions.revokeByRawToken(rawToken);
      if (userId) {
        await this.auth.logout(undefined, userId, this.meta(req), false);
      }
    }
    clearSessionCookie(res, this.cookieSettings());
    return { message: AUTH_MESSAGES.loggedOut };
  }

  @Get("me")
  @SkipThrottle({ [THROTTLE_NAMES.AUTH]: true })
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: "Current authenticated user and session" })
  @ApiOkResponse({ type: AuthMeResponseDto })
  @ApiUnauthorizedResponse({ type: UnauthorizedErrorResponseDto })
  me(
    @CurrentUser() user: AuthenticatedRequestUser,
    @CurrentSession() session: AuthenticatedSession,
  ): AuthMeResponseDto {
    return {
      user: {
        id: user.id,
        email: user.email,
        status: user.status,
        platformRole: user.platformRole,
        emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
      },
      session: {
        id: session.id,
        createdAt: session.createdAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        lastUsedAt: session.lastUsedAt.toISOString(),
      },
    };
  }

  @Post("verify-email")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Verify email with a single-use token" })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiBadRequestResponse({ type: ValidationErrorResponseDto })
  async verifyEmail(@Body() body: TokenDto): Promise<MessageResponseDto> {
    await this.verification.verify(body.token);
    return { message: AUTH_MESSAGES.emailVerified };
  }

  @Post("resend-verification")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Resend email verification",
    description: "Always returns a generic message. Sends mail only when verification is still needed.",
  })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiBadRequestResponse({ type: ValidationErrorResponseDto })
  async resendVerification(@Body() body: EmailDto): Promise<MessageResponseDto> {
    await this.verification.resend(normalizeEmail(body.email));
    return { message: AUTH_MESSAGES.resendVerification };
  }

  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Request a password reset",
    description: "Always returns a generic message so callers cannot enumerate accounts.",
  })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiBadRequestResponse({ type: ValidationErrorResponseDto })
  async forgotPassword(@Body() body: EmailDto): Promise<MessageResponseDto> {
    await this.passwordReset.forgot(normalizeEmail(body.email));
    return { message: AUTH_MESSAGES.forgotPassword };
  }

  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Reset password with a single-use token",
    description: "Updates the password hash and revokes all existing sessions.",
  })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiBadRequestResponse({ type: ValidationErrorResponseDto })
  async resetPassword(
    @Body() body: ResetPasswordDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MessageResponseDto> {
    await this.passwordReset.reset(body.token, body.password);
    clearSessionCookie(res, this.cookieSettings());
    return { message: AUTH_MESSAGES.passwordReset };
  }

  @Post("accept-invitation")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Accept a dietitian activation invitation",
    description: "Sets password, activates the user, and consumes the invitation token.",
  })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiBadRequestResponse({ type: ValidationErrorResponseDto })
  async acceptInvitation(
    @Body() body: AcceptInvitationDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MessageResponseDto> {
    await this.auth.acceptDietitianInvitation(body.token, body.password, this.meta(req));
    clearSessionCookie(res, this.cookieSettings());
    return { message: AUTH_MESSAGES.invitationAccepted };
  }

  @Post("sessions/revoke-all")
  @SkipThrottle({ [THROTTLE_NAMES.AUTH]: true })
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: "Revoke all sessions for the current user" })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiUnauthorizedResponse({ type: UnauthorizedErrorResponseDto })
  async revokeAll(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MessageResponseDto> {
    await this.auth.revokeAllSessions(user.id, this.meta(req));
    clearSessionCookie(res, this.cookieSettings());
    return { message: "All sessions revoked" };
  }

  private meta(req: Request) {
    return {
      ipAddress: requestIp(req),
      userAgent: requestUserAgent(req),
    };
  }

  private cookieSettings(): CookieSettings {
    return {
      NODE_ENV: this.config.get("NODE_ENV", { infer: true }),
      COOKIE_SECURE: this.config.get("COOKIE_SECURE", { infer: true }),
      SESSION_TTL_SECONDS: this.config.get("SESSION_TTL_SECONDS", { infer: true }),
    };
  }
}
