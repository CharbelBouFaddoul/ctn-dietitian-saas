import { Injectable, Logger } from "@nestjs/common";
import type { EmailMessage, EmailProvider } from "./email.provider";

@Injectable()
export class ConsoleEmailProvider implements EmailProvider {
  private readonly logger = new Logger(ConsoleEmailProvider.name);

  async send(message: EmailMessage): Promise<void> {
    this.logger.log(`to=${message.to} subject=${message.subject}\n${message.text}`);
  }
}
