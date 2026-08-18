import { SetMetadata } from "@nestjs/common";
import type { OrganizationRole } from "@nutrition-saas/types";

export const ORG_ROLES_KEY = "orgRoles";

export const OrgRoles = (...roles: OrganizationRole[]) => SetMetadata(ORG_ROLES_KEY, roles);
