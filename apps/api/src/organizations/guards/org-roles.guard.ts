import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { OrganizationRole } from "@nutrition-saas/types";
import type { Request } from "express";
import { ORG_ROLES_KEY } from "../decorators/org-roles.decorator";
import { ORGANIZATION_ACCESS_DENIED } from "../tenant.types";

@Injectable()
export class OrgRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<OrganizationRole[]>(ORG_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!roles || roles.length === 0) {
      return true;
    }

    const tenant = context.switchToHttp().getRequest<Request>().tenant;
    if (!tenant || !roles.includes(tenant.role)) {
      throw new ForbiddenException(ORGANIZATION_ACCESS_DENIED);
    }

    return true;
  }
}
