import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { PlatformRole } from "@nutrition-saas/types";
import type { Request } from "express";
import { AUTH_MESSAGES } from "../../auth/auth.messages";
import { ADMIN_MESSAGES } from "../admin.messages";
import { PLATFORM_ROLES_KEY } from "../decorators/platform-roles.decorator";

@Injectable()
export class PlatformRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<Request>().user;
    if (!user) {
      throw new UnauthorizedException(AUTH_MESSAGES.authenticationRequired);
    }

    const required = this.reflector.getAllAndOverride<PlatformRole[]>(PLATFORM_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const role = user.platformRole;
    if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
      throw new ForbiddenException(ADMIN_MESSAGES.forbidden);
    }

    if (required && required.length > 0 && !required.includes(role)) {
      throw new ForbiddenException(ADMIN_MESSAGES.forbidden);
    }

    return true;
  }
}
