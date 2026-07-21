import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, type Payment } from '@prisma/client';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  canTransitionOrder,
} from '@amragrir/shared';
import { PrismaService } from '../prisma/prisma.service';
import { OrderEventsService, toStatusEvent } from '../orders/order-events.service';
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
  ) {}

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

    // Cash is settled at the counter, so nothing is captured now — but the
    // order still commits, otherwise the kitchen never sees it
    // (BUSINESS_LOGIC.md §5: "Place order" without online payment).
    if (dto.method === PaymentMethod.Cash) {
      return this.settle(order.id, order.status as OrderStatus, order.payment, {
        method: dto.method,
        amountAmd,
        status: PaymentStatus.Pending,
        providerRef: null,
      });
    }

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
        await this.record(order.id, order.payment, {
          method: dto.method,
          amountAmd,
          status: PaymentStatus.Failed,
          providerRef: null,
        });
        throw new UnprocessableEntityException(err.message);
      }
      throw err;
    }

    return this.settle(order.id, order.status as OrderStatus, order.payment, {
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
   */
  async reverse(payment: Payment): Promise<PaymentStatus> {
    if (payment.status === PaymentStatus.Captured) {
      await this.provider.refund(payment.providerRef, payment.amountAmd);
      return PaymentStatus.Refunded;
    }
    // Pending (cash) or authorized: nothing left the customer's account.
    return PaymentStatus.Cancelled;
  }

  /** Writes the payment and moves the order to `paid` in one transaction —
   *  a captured charge with an unpaid order is money the kitchen never hears about. */
  private async settle(
    orderId: string,
    expectedStatus: OrderStatus,
    existing: Payment | null,
    data: PaymentWrite,
  ): Promise<PaymentResult> {
    const [payment, order] = await this.prisma
      .$transaction([
        this.upsert(orderId, existing, data),
        this.prisma.order.update({
          // The status is part of the match, not just the payload: the check
          // above ran before the charge, and a cancellation could have landed
          // in between. Without it, paying would silently un-cancel an order.
          where: { id: orderId, status: expectedStatus },
          data: { status: OrderStatus.Paid },
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

    return {
      id: payment.id,
      status: payment.status as PaymentStatus,
      amountAmd: payment.amountAmd,
      method: payment.method as PaymentMethod,
      orderStatus: order.status as OrderStatus,
    };
  }

  /** Records an attempt without advancing the order (used for declines). */
  private async record(
    orderId: string,
    existing: Payment | null,
    data: PaymentWrite,
  ): Promise<void> {
    await this.upsert(orderId, existing, data);
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
