import { Inject, Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import type { Payment } from '@prisma/client';
import { DepositOutcome, PaymentMethod, PaymentStatus } from '@amragrir/shared';
import {
  PAYMENT_PROVIDER,
  PaymentDeclinedError,
  type ChargeResult,
  type PaymentProvider,
} from './payment.provider';

/**
 * Table deposits.
 *
 * Separate from `PaymentsService` because a deposit is a *hold*, not a sale:
 * it is authorized when a table is booked and only later captured, released or
 * credited (BUSINESS_LOGIC.md §3). Folding both into one service would mean an
 * order path and a booking path sharing methods where every branch differs.
 */
@Injectable()
export class DepositsService {
  private readonly logger = new Logger(DepositsService.name);

  constructor(@Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider) {}

  async authorize(request: {
    amountAmd: number;
    method: PaymentMethod;
    reference: string;
    token?: string;
  }): Promise<ChargeResult> {
    try {
      return await this.provider.authorize(request);
    } catch (err) {
      if (err instanceof PaymentDeclinedError) {
        throw new UnprocessableEntityException(err.message);
      }
      throw err;
    }
  }

  async release(providerRef: string | null): Promise<void> {
    await this.provider.release(providerRef);
  }

  /**
   * Carries out a deposit outcome and reports the status to record.
   *
   * The caller applies the status inside its own transaction so the payment
   * and the reservation change together.
   */
  async settle(payment: Payment, outcome: DepositOutcome): Promise<PaymentStatus> {
    const status = payment.status as PaymentStatus;

    // Nothing is being held, so nothing can be released or taken. Reaching
    // here means the deposit already resolved; saying so beats a provider
    // call that would fail with a confusing error.
    if (status !== PaymentStatus.Authorized) {
      return status;
    }

    if (outcome === DepositOutcome.Refund) {
      await this.provider.release(payment.providerRef);
      // Released, not refunded: the money was never taken, so the guest sees
      // a hold disappear rather than a charge and a return.
      return PaymentStatus.Cancelled;
    }

    // Capture and credit both take the money. They differ in what it is for —
    // a kept deposit versus one that comes off the bill — which the
    // reservation records, not the payment.
    await this.provider.capture(payment.providerRef, payment.amountAmd);
    return PaymentStatus.Captured;
  }
}
