import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "@nutrition-saas/validation";
import nodemailer from "nodemailer";
import type { EmailMessage, EmailProvider } from "./email.provider";

@Injectable()
export class SmtpEmailProvider implements EmailProvider {
  private readonly logger = new Logger(SmtpEmailProvider.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;

  constructor(private readonly config: ConfigService<AppEnv, true>) {
    const host = this.config.get("SMTP_HOST", { infer: true });
    const port = this.config.get("SMTP_PORT", { infer: true });
    const user = this.config.get("SMTP_USER", { infer: true });
    const pass = this.config.get("SMTP_PASSWORD", { infer: true });
    const secure = this.config.get("SMTP_SECURE", { infer: true }) === "true";
    this.from = this.config.get("EMAIL_FROM", { infer: true }) ?? "noreply@nutrition.local";

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user ? { user, pass: pass ?? "" } : undefined,
    });
  }

  async send(message: EmailMessage): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send email to ${message.to}: ${error instanceof Error ? error.message : error}`,
      );
      throw error;
    }
  }
}
