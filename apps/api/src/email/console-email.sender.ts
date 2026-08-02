import { Injectable, Logger } from '@nestjs/common';
import { EmailMessage, EmailSender } from './email.sender';

/**
 * Development sender — logs the message instead of sending it, so the invite
 * and password-reset flows are testable without a provider account.
 *
 * NOT for production: invite and reset links are single-use credentials, and
 * this prints them in plaintext to the server log.
 */
@Injectable()
export class ConsoleEmailSender implements EmailSender {
  private readonly logger = new Logger('EMAIL');

  send(message: EmailMessage): Promise<void> {
    this.logger.log(`[dev] to ${message.to} — ${message.subject}\n${message.body}`);
    return Promise.resolve();
  }
}
