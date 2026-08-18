import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { FoodsModule } from "../foods/foods.module";
import { OrganizationModule } from "../organizations/organization.module";
import { FoodOverrideController } from "./food-override.controller";
import { FoodOverrideService } from "./food-override.service";

@Module({
  imports: [AuthModule, OrganizationModule, FoodsModule],
  controllers: [FoodOverrideController],
  providers: [FoodOverrideService],
})
export class FoodOverridesModule {}
