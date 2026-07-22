import type { PaymentMethod } from '@amragrir/shared';

/**
 * Acquiring boundary. The provider for Armenia is still an open question
 * (DEVELOPMENT_GUIDE.md), so nothing outside this file knows who processes a
 * card — swapping in a real gateway is a `useClass` change in PaymentsModule,
 * exactly as with `SmsSender`.
 */
export interface PaymentProvider {
  charge(request: ChargeRequest): Promise<ChargeResult>;
  /** Returns the money for an already-captured charge. */
  refund(providerRef: string | null, amountAmd: number): Promise<void>;

  /**
   * Holds an amount without taking it — what a table deposit actually is
   * (BUSINESS_LOGIC.md §3: authorized at booking, captured or released later).
   *
   * Distinct from `charge` because the difference is the product promise: a
   * guest who cancels in time never had the money taken, and a hold that
   * expires costs them nothing. Every real acquirer models this separately.
   */
  authorize(request: ChargeRequest): Promise<ChargeResult>;

  /** Takes a previously authorized amount. */
  capture(providerRef: string | null, amountAmd: number): Promise<void>;

  /** Lets an authorization go without taking anything. */
  release(providerRef: string | null): Promise<void>;
}

export interface ChargeRequest {
  amountAmd: number;
  method: PaymentMethod;
  /** Human-readable reference shown on the statement — the order code. */
  reference: string;
  /** Opaque wallet/card token from the client SDK. Never a raw card number:
   *  card data must not reach this server (PCI scope). */
  token?: string;
}

export interface ChargeResult {
  providerRef: string;
}

/** A refusal by the acquirer — a business outcome, not a server fault. */
export class PaymentDeclinedError extends Error {
  constructor(message = 'The payment was declined') {
    super(message);
    this.name = 'PaymentDeclinedError';
  }
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
