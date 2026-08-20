import { Global, Module, forwardRef } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "@nutrition-saas/validation";
import { PlatformSettingsModule } from "../platform-settings/platform-settings.module";
import { ConsoleEmailProvider } from "./console-email.provider";
import { EMAIL_PROVIDER } from "./email.provider";
import { EmailService } from "./email.service";
import { SmtpEmailProvider } from "./smtp-email.provider";

@Global()
@Module({
  imports: [forwardRef(() => PlatformSettingsModule)],
  providers: [
    ConsoleEmailProvider,
    SmtpEmailProvider,
    {
      provide: EMAIL_PROVIDER,
      inject: [ConfigService, ConsoleEmailProvider, SmtpEmailProvider],
      useFactory: (
        config: ConfigService<AppEnv, true>,
        consoleProvider: ConsoleEmailProvider,
        smtpProvider: SmtpEmailProvider,
      ) => {
        const provider = config.get("EMAIL_PROVIDER", { infer: true });
        return provider === "smtp" ? smtpProvider : consoleProvider;
      },
    },
    EmailService,
  ],
  exports: [EmailService, EMAIL_PROVIDER],
})
export class EmailModule {}
