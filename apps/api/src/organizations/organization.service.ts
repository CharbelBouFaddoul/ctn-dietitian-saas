import { BadRequestException } from "@nestjs/common";

/**
 * @deprecated Prefer DietitianService / DietitianModule.
 * Constants kept here because many tests and assignment guards import them.
 */
export { DietitianService as OrganizationService } from "../dietitian/dietitian.service";

export const MULTI_MEMBER_UNSUPPORTED = "Multi-member practices are not supported";

export function rejectMultiMember(): never {
  throw new BadRequestException(MULTI_MEMBER_UNSUPPORTED);
}
