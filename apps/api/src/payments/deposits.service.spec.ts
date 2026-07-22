import { UnprocessableEntityException } from '@nestjs/common';
import { DepositOutcome, PaymentMethod, PaymentStatus } from '@amragrir/shared';
import { DepositsService } from './deposits.service';
import { PaymentDeclinedError, type PaymentProvider } from './payment.provider';

function build(over: Partial<PaymentProvider> = {}) {
  const provider: PaymentProvider = {
    charge: jest.fn(),
    refund: jest.fn(),
    authorize: jest.fn().mockResolvedValue({ providerRef: 'dev_auth_1' }),
    capture: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    ...over,
  };
  return { service: new DepositsService(provider), provider };
}

const held = (over: Record<string, unknown> = {}) =>
  ({
    id: 'pay-1',
    status: PaymentStatus.Authorized,
    amountAmd: 4000,
    providerRef: 'dev_auth_1',
    ...over,
  }) as never;

describe('authorize', () => {
  it('holds the money rather than taking it', async () => {
    // The difference is the product promise: cancel in time and nothing was
    // ever charged.
    const { service, provider } = build();
    await service.authorize({
      amountAmd: 4000,
      method: PaymentMethod.Card,
      reference: 'Table at Sunny Table',
    });

    expect(provider.authorize).toHaveBeenCalled();
    expect(provider.charge).not.toHaveBeenCalled();
  });

  it('turns a decline into a business-rule failure, not a 500', async () => {
    const { service } = build({
      authorize: jest.fn().mockRejectedValue(new PaymentDeclinedError()),
    });

    await expect(
      service.authorize({ amountAmd: 4000, method: PaymentMethod.Card, reference: 'x' }),
    ).rejects.toThrow(UnprocessableEntityException);
  });
});

describe('settle', () => {
  it('releases the hold on a refund, and records it as cancelled', async () => {
    // Released, not refunded: the guest never sees a charge appear and vanish.
    const { service, provider } = build();
    const status = await service.settle(held(), DepositOutcome.Refund);

    expect(provider.release).toHaveBeenCalledWith('dev_auth_1');
    expect(provider.capture).not.toHaveBeenCalled();
    expect(status).toBe(PaymentStatus.Cancelled);
  });

  it('captures on a no-show', async () => {
    const { service, provider } = build();
    const status = await service.settle(held(), DepositOutcome.Capture);

    expect(provider.capture).toHaveBeenCalledWith('dev_auth_1', 4000);
    expect(status).toBe(PaymentStatus.Captured);
  });

  it('captures when crediting, because the money still moves', async () => {
    // Capture and credit differ in what the money is for, which the
    // reservation records — not the payment.
    const { service, provider } = build();
    const status = await service.settle(held(), DepositOutcome.Credit);

    expect(provider.capture).toHaveBeenCalled();
    expect(status).toBe(PaymentStatus.Captured);
  });

  it('does nothing when the deposit already resolved', async () => {
    // Reaching the provider with an already-captured hold would fail with a
    // confusing error instead of a clear no-op.
    const { service, provider } = build();
    const status = await service.settle(held({ status: PaymentStatus.Captured }), DepositOutcome.Refund);

    expect(provider.release).not.toHaveBeenCalled();
    expect(provider.capture).not.toHaveBeenCalled();
    expect(status).toBe(PaymentStatus.Captured);
  });
});
