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
