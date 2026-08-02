import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, type Payment } from '@prisma/client';
import {
  OrderEventType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  canTransitionOrder,
  pointsFor,
} from '@amragrir/shared';
import { PrismaService } from '../prisma/prisma.service';
import { OrderEventsService, toStatusEvent } from '../orders/order-events.service';
import { customerActor, orderEventData } from '../orders/order-history';
import { ReferralsService } from '../referrals/referrals.service';
import { PAYMENT_PROVIDER, PaymentDeclinedError, type PaymentProvider } from './payment.provider';
import { CreatePaymentDto } from './dto';

/** Default offered by the design's checkout screen. */
const DEFAULT_METHOD = PaymentMethod.ApplePay;

export interface PaymentResult {
  id: string;
  status: PaymentStatus;
  amountAmd: number;
  method: PaymentMethod;
  orderStatus: OrderStatus;
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly events: OrderEventsService,
    private readonly referrals: ReferralsService,
  ) {}

  private readonly logger = new Logger(PaymentsService.name);

  methods(): { methods: PaymentMethod[]; default: PaymentMethod } {
    return { methods: Object.values(PaymentMethod), default: DEFAULT_METHOD };
  }

  /**
   * Pays for an order.
   *
   * The amount is read from the order, never from the request: the client says
   * *which* order and *how*, and the server decides *how much*.
   */
  async pay(userId: string, dto: CreatePaymentDto): Promise<PaymentResult> {
    const order = await this.prisma.order.findFirst({
      where: { id: dto.orderId, userId },
      include: { payment: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // The state machine is the authority on whether paying is legal here, so
    // a cancelled or already-preparing order cannot be charged again.
    if (!canTransitionOrder(order.status as OrderStatus, OrderStatus.Paid)) {
      throw new ConflictException(`An order that is ${order.status} cannot be paid`);
    }
    if (order.payment && !isRetryable(order.payment.status as PaymentStatus)) {
      throw new ConflictException('This order has already been paid');
    }

    const amountAmd = order.totalAmd;

    // Every method goes through the provider. There is no longer a "place the
    // order and settle at the counter" path — an order reaches the kitchen only
    // once the money is actually taken (BUSINESS_LOGIC.md §5).
    let providerRef: string;
    try {
      const result = await this.provider.charge({
        amountAmd,
        method: dto.method,
        reference: order.code,
        token: dto.token,
      });
      providerRef = result.providerRef;
    } catch (err) {
      if (err instanceof PaymentDeclinedError) {
        // Record the attempt: a declined payment the customer can retry is a
        // different situation from one that was never made.
        await this.record(order, order.payment, {
          method: dto.method,
          amountAmd,
          status: PaymentStatus.Failed,
          providerRef: null,
        });
        throw new UnprocessableEntityException(err.message);
      }
      throw err;
    }

    return this.settle(order, order.payment, {
      method: dto.method,
      amountAmd,
      status: PaymentStatus.Captured,
      providerRef,
    });
  }

  /**
   * Reverses whatever was taken for an order and reports the status the
   * payment should end up in. The caller applies it, so the payment row and
   * the order status change together in one transaction.
   *
   * An order can only be cancelled before it is paid, so in practice what
   * reaches here is a *declined* attempt on an order the customer then dropped
   * — nothing to refund. The capture branch is kept for the rows that predate
   * that rule, and because a payment row and an order status that disagree is
   * exactly the case this must not silently skip.
   */
  async reverse(payment: Payment): Promise<PaymentStatus> {
    if (payment.status === PaymentStatus.Captured) {
      await this.provider.refund(payment.providerRef, payment.amountAmd);
      return PaymentStatus.Refunded;
    }
    // Failed, pending or authorized: nothing left the customer's account.
    return PaymentStatus.Cancelled;
  }

  /**
   * Rewards a paid order: points for the buyer, and the referral credit for
   * whoever invited them.
   *
   * After the payment has committed, and each failure swallowed with a log.
   * Points and referrals are loyalty bookkeeping — losing one is a support
   * ticket, while failing the request would tell a customer their successful
   * payment failed and invite them to pay again.
   */
  private async reward(userId: string, subtotalAmd: number): Promise<void> {
    const points = pointsFor(subtotalAmd);

    try {
      if (points > 0) {
        await this.prisma.user.update({
          where: { id: userId },
          data: { rewardPoints: { increment: points } },
        });
      }
    } catch (err) {
      this.logger.error(`Could not award ${points} points to ${userId}`, err as Error);
    }

    try {
      await this.referrals.creditReferrerFor(userId);
    } catch (err) {
      this.logger.error(`Could not credit the referrer of ${userId}`, err as Error);
    }
  }

  /** Writes the payment and moves the order to `paid` in one transaction —
   *  a captured charge with an unpaid order is money the kitchen never hears about. */
  private async settle(
    target: PaidOrder,
    existing: Payment | null,
    data: PaymentWrite,
  ): Promise<PaymentResult> {
    const expectedStatus = target.status as OrderStatus;

    const [payment, order] = await this.prisma
      .$transaction([
        this.upsert(target.id, existing, data),
        this.prisma.order.update({
          // The status is part of the match, not just the payload: the check
          // above ran before the charge, and a cancellation could have landed
          // in between. Without it, paying would silently un-cancel an order.
          where: { id: target.id, status: expectedStatus },
          data: { status: OrderStatus.Paid },
        }),
        // In the same transaction as the move it describes, so the order's
        // history cannot end up missing the step that took the money — or
        // claiming one that the optimistic match above rejected.
        this.prisma.orderEvent.create({
          data: {
            orderId: target.id,
            ...orderEventData({
              type: OrderEventType.StatusChanged,
              // The customer: paying is something they did, even where the
              // provider is what actually moved the money.
              actor: customerActor(target.userId),
              fromStatus: expectedStatus,
              toStatus: OrderStatus.Paid,
              detail: {
                paymentMethod: data.method,
                paymentStatus: data.status,
                amountAmd: data.amountAmd,
              },
            }),
          },
        }),
      ])
      .catch((err: unknown) => {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
          throw new ConflictException('The order changed while the payment was being processed');
        }
        throw err;
      });

    // Paying is a status change like any other, so anyone watching the order
    // hears about it — otherwise the tracking screen would open on stale data.
    this.events.publish(toStatusEvent(order));

    await this.reward(order.userId, order.subtotalAmd);

    return {
      id: payment.id,
      status: payment.status as PaymentStatus,
      amountAmd: payment.amountAmd,
      method: payment.method as PaymentMethod,
      orderStatus: order.status as OrderStatus,
    };
  }

  /**
   * Records an attempt without advancing the order (used for declines).
   *
   * The history entry is the whole reason a decline is visible at all: it moves
   * no status, so without a row of its own the timeline would show an order
   * sitting in `created` for twenty minutes with nothing to explain why.
   */
  private async record(
    target: PaidOrder,
    existing: Payment | null,
    data: PaymentWrite,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.upsert(target.id, existing, data),
      this.prisma.orderEvent.create({
        data: {
          orderId: target.id,
          ...orderEventData({
            type: OrderEventType.Payment,
            actor: customerActor(target.userId),
            detail: {
              paymentMethod: data.method,
              paymentStatus: data.status,
              amountAmd: data.amountAmd,
            },
          }),
        },
      }),
    ]);
  }

  private upsert(
    orderId: string,
    existing: Payment | null,
    data: PaymentWrite,
  ): Prisma.PrismaPromise<Payment> {
    // `payments.order_id` is unique, so a retry after a decline updates the
    // existing row rather than creating a second one.
    return existing
      ? this.prisma.payment.update({ where: { id: existing.id }, data })
      : this.prisma.payment.create({ data: { orderId, ...data } });
  }
}

/** The little of an order this service needs: which one, whose it is (the
 *  history entry has to name somebody), and the status the decision to charge
 *  was taken against. */
interface PaidOrder {
  id: string;
  userId: string;
  status: string;
}

interface PaymentWrite {
  method: PaymentMethod;
  amountAmd: number;
  status: PaymentStatus;
  providerRef: string | null;
}

/** A payment that never took money may be attempted again. */
function isRetryable(status: PaymentStatus): boolean {
  return status === PaymentStatus.Failed || status === PaymentStatus.Cancelled;
}
