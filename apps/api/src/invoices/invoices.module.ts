import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ClientsModule } from "../clients/clients.module";
import { EmailModule } from "../email/email.module";
import { DietitianModule } from "../dietitian/dietitian.module";
import { TimelineModule } from "../timeline/timeline.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { InvoiceNumberService } from "./invoice-number.service";
import { InvoiceService } from "./invoice.service";
import { OrganizationInvoicesController, PortalInvoicesController } from "./invoices.controller";

@Module({
  imports: [
    AuthModule,
    DietitianModule,
    ClientsModule,
    TimelineModule,
    NotificationsModule,
    EmailModule,
  ],
  controllers: [PortalInvoicesController, OrganizationInvoicesController],
  providers: [InvoiceService, InvoiceNumberService],
  exports: [InvoiceService],
})
export class InvoicesModule {}
