import { Global, Module } from "@nestjs/common";
import { ErrorTrackingService } from "./error-tracking.service";

@Global()
@Module({
  providers: [ErrorTrackingService],
  exports: [ErrorTrackingService],
})
export class CommonModule {}
