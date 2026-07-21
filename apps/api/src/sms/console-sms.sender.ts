import { Injectable, Logger } from '@nestjs/common';
import { SmsSender } from './sms.sender';

/**
 * Development sender — logs the message instead of sending it, so the whole
 * OTP flow is testable without a provider account. NOT for production: it
 * prints the code in plaintext to the server log.
 */
@Injectable()
export class ConsoleSmsSender implements SmsSender {
  private readonly logger = new Logger('SMS');

  send(to: string, message: string): Promise<void> {
    this.logger.log(`[dev] to ${to}: ${message}`);
    return Promise.resolve();
  }
}
