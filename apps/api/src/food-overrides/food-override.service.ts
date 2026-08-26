import { ForbiddenException, Injectable } from "@nestjs/common";
import type { NutritionValues } from "@nutrition-saas/nutrition";
import type { DietitianTenantContext } from "../dietitian/dietitian.types";

export type OverrideInput = Partial<NutritionValues>;

const CATALOG_READ_ONLY =
  "Catalog foods are read-only. Duplicate the food to edit it in your clinic.";

@Injectable()
export class FoodOverrideService {
  upsert(_tenant: DietitianTenantContext, _foodId: string, _input: OverrideInput): never {
    throw new ForbiddenException(CATALOG_READ_ONLY);
  }

  remove(_tenant: DietitianTenantContext, _foodId: string): never {
    throw new ForbiddenException(CATALOG_READ_ONLY);
  }
}
