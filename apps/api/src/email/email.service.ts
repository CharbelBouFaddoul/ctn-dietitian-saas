import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "@nutrition-saas/validation";
import { EMAIL_PROVIDER, type EmailProvider } from "./email.provider";

@Injectable()
export class EmailService {
  constructor(
    @Inject(EMAIL_PROVIDER) private readonly provider: EmailProvider,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  async sendVerification(to: string, rawToken: string): Promise<void> {
    const url = this.link("/auth/verify-email", rawToken);
    await this.provider.send({
      to,
      subject: "Verify your email",
      text: [
        "Verify your Nutrition SaaS email address.",
        `Open: ${url}`,
        `Token: ${rawToken}`,
      ].join("\n"),
    });
  }

  async sendPasswordReset(to: string, rawToken: string): Promise<void> {
    const url = this.link("/auth/reset-password", rawToken);
    await this.provider.send({
      to,
      subject: "Reset your password",
      text: [
        "A password reset was requested for your Nutrition SaaS account.",
        `Open: ${url}`,
        `Token: ${rawToken}`,
      ].join("\n"),
    });
  }

  async sendInvitation(to: string, rawToken: string, purpose: string): Promise<void> {
    const url = this.link("/auth/invitation", rawToken);
    await this.provider.send({
      to,
      subject: "You have been invited",
      text: [
        `Invitation purpose: ${purpose}`,
        "This infrastructure email is ready for later staff/client invitation workflows.",
        `Open: ${url}`,
        `Token: ${rawToken}`,
      ].join("\n"),
    });
  }

  async sendDietitianActivation(to: string, rawToken: string): Promise<void> {
    const url = this.link("/auth/invitation", rawToken);
    await this.provider.send({
      to,
      subject: "Activate your practice account",
      text: [
        "An administrator provisioned a dietitian practice account for you.",
        "Set your password to activate the account:",
        `Open: ${url}`,
        `Token: ${rawToken}`,
      ].join("\n"),
    });
  }

  async sendInvoiceNotification(
    to: string,
    invoiceNumber: string,
    total: number,
    currency: string,
  ): Promise<void> {
    await this.provider.send({
      to,
      subject: `Invoice ${invoiceNumber}`,
      text: [
        "Your dietitian has shared an invoice with you.",
        `Invoice: ${invoiceNumber}`,
        `Amount: ${total.toFixed(2)} ${currency}`,
        "Sign in to your client portal to view the invoice.",
      ].join("\n"),
    });
  }

  async sendAutomationMessage(to: string, subject: string, body: string): Promise<void> {
    await this.provider.send({
      to,
      subject,
      text: body,
    });
  }

  private link(path: string, rawToken: string): string {
    const base = this.config.get("APP_URL", { infer: true }).replace(/\/$/, "");
    return `${base}${path}?token=${encodeURIComponent(rawToken)}`;
  }
}
