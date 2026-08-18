import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ClientsModule } from "../clients/clients.module";
import { OrganizationModule } from "../organizations/organization.module";
import { FoodController } from "./food.controller";
import { FoodSourceController } from "./food-source.controller";
import { PortalFoodController } from "./portal-food.controller";
import { FoodService } from "./food.service";

@Module({
  imports: [AuthModule, OrganizationModule, ClientsModule],
  controllers: [FoodController, FoodSourceController, PortalFoodController],
  providers: [FoodService],
  exports: [FoodService],
})
export class FoodsModule {}
