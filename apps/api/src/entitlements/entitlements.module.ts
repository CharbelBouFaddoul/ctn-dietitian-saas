import { Global, Module } from "@nestjs/common";
import { EntitlementService } from "./entitlement.service";
import { SubscriptionLifecycleService } from "./subscription-lifecycle.service";

@Global()
@Module({
  providers: [EntitlementService, SubscriptionLifecycleService],
  exports: [EntitlementService, SubscriptionLifecycleService],
})
export class EntitlementsModule {}
