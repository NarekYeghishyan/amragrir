import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  ChargeRequest,
  ChargeResult,
  PaymentDeclinedError,
  PaymentProvider,
} from './payment.provider';

/**
 * Development provider — approves everything and logs it, so the order and
 * payment flow is testable before an acquirer is chosen. NOT for production:
 * it moves no money.
 *
 * Passing the token `decline` makes it refuse, so the declined path is
 * reachable in dev and in tests instead of being written and never run.
 */
export const DECLINE_TOKEN = 'decline';

@Injectable()
export class ConsolePaymentProvider implements PaymentProvider {
  private readonly logger = new Logger('Payments');

  charge(request: ChargeRequest): Promise<ChargeResult> {
    if (request.token === DECLINE_TOKEN) {
      this.logger.warn(`[dev] declined ${request.amountAmd} AMD for ${request.reference}`);
      return Promise.reject(new PaymentDeclinedError());
    }

    const providerRef = `dev_${randomUUID()}`;
    this.logger.log(
      `[dev] charged ${request.amountAmd} AMD via ${request.method} for ${request.reference} (${providerRef})`,
    );
    return Promise.resolve({ providerRef });
  }

  refund(providerRef: string | null, amountAmd: number): Promise<void> {
    this.logger.log(`[dev] refunded ${amountAmd} AMD (${providerRef ?? 'no reference'})`);
    return Promise.resolve();
  }
}
