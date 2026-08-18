import type { EmailMessage, EmailProvider } from "../src/email/email.provider";

export class CapturingEmailProvider implements EmailProvider {
  readonly messages: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.messages.push(message);
  }

  last(): EmailMessage {
    const message = this.messages.at(-1);
    if (!message) {
      throw new Error("No email captured");
    }
    return message;
  }
}
