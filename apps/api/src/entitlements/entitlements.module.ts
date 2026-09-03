import { Global, Module } from "@nestjs/common";
import { EntitlementService } from "./entitlement.service";
import { SubscriptionLifecycleService } from "./subscription-lifecycle.service";
import { TrialProvisioningService } from "./trial-provisioning.service";

@Global()
@Module({
  providers: [EntitlementService, SubscriptionLifecycleService, TrialProvisioningService],
  exports: [EntitlementService, SubscriptionLifecycleService, TrialProvisioningService],
})
export class EntitlementsModule {}
