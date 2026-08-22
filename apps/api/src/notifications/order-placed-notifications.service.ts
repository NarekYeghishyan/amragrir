import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { StaffNotificationType } from '@prisma/client';
import { OrderStatus } from '@amragrir/shared';
import { PrismaService } from '../prisma/prisma.service';
import { OrderEventsService, type OrderStatusEvent } from '../orders/order-events.service';
import { StaffNotificationsService } from './staff-notifications.service';

/**
 * Telling a branch that somebody is waiting on it to say yes.
 *
 * **The one order that reached nobody.** Until this existed, the only thing a
 * branch was ever told was `prep_due` — a pre-order coming up. That is the right
 * notification for a pre-order and it is the *only* notification a pre-order
 * needs, because paying accepts one outright (`payments.service.ts`): it is
 * confirmed on the spot precisely so it does not sit unanswered for five days,
 * and the branch hears about it when the work is actually in front of somebody.
 *
 * An immediate order is the opposite case and had nothing at all. It stops at
 * `paid` and waits for a human to accept it, with a diner watching a screen that
 * says the restaurant has not looked at their order yet. It appeared on the
 * board, silently, and a board is not something anybody watches — which is the
 * whole reason the bell exists for the other kind.
 *
 * **The trigger is therefore `paid` and not `confirmed`.** `confirmed` is the
 * answer to this notification, not the occasion for it; announcing it would be
 * telling a shift about a decision that shift had just made. And `created` is
 * silent for the reason it is silent for the customer — an order nobody has paid
 * for may never become work.
 *
 * Like `CustomerNotificationsService`, this listens to the order stream rather
 * than being called from the place that moves an order, so it cannot be
 * forgotten by whatever moves one next. Events are published after the
 * transaction commits, so a bell can never describe a payment that rolled back.
 */
@Injectable()
export class OrderPlacedNotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderPlacedNotificationsService.name);
  private unsubscribe?: () => void;

  constructor(
    private readonly prisma: PrismaService,
    private readonly orderEvents: OrderEventsService,
    private readonly notifications: StaffNotificationsService,
  ) {}

  onModuleInit(): void {
    this.unsubscribe = this.orderEvents.subscribe((event) => {
      // The listener is sync and the work is not. Without this, one failed write
      // is an unhandled rejection, which takes the API down over a bell.
      void this.onOrderMoved(event).catch((error: unknown) => {
        this.logger.error(
          `Could not raise the placed-order notification for ${event.orderId}: ${String(error)}`,
        );
      });
    });
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
  }

  private async onOrderMoved(event: OrderStatusEvent): Promise<void> {
    if (event.status !== OrderStatus.Paid) {
      return;
    }

    const order = await this.prisma.order.findUnique({
      where: { id: event.orderId },
      select: {
        branchId: true,
        code: true,
        readyAt: true,
        // Not to display, but to decide: a row here means this was placed as a
        // pre-order, which `prep_due` will announce at its proper hour.
        reminderAt: true,
        items: { select: { qty: true } },
      },
    });

    if (!order) {
      // Deleted between the event and this read. Nothing to announce, and the
      // panel is better off hearing nothing than hearing about a ghost.
      return;
    }

    // **A pre-order announces itself later, once.** Decided on `reminder_at`
    // alone rather than on the clock, the same way `payments.service.ts` decides
    // whether to accept it: whether this was a pre-order is a fact about how it
    // was placed, and must not depend on how long the customer took to pay.
    if (order.reminderAt !== null) {
      return;
    }

    const payload = {
      // The order's name, never its collection code — the bell is a screen a
      // shift leaves open on a counter, and the code is the one thing the
      // counter is supposed to ask a guest for. Same rule as `prep_due`.
      code: order.code,
      readyAt: order.readyAt?.toISOString() ?? null,
      itemsCount: order.items.reduce((total, item) => total + item.qty, 0),
      // True by definition for this kind: it exists because nobody has accepted
      // it yet. Carried anyway, so the panel can draw both kinds of row from one
      // payload shape rather than knowing which fields belong to which type.
      needsConfirming: true,
    };

    // `this.prisma` as the transaction client: `record` takes one so a caller
    // that has a transaction can write the notification with whatever it is
    // about, and the reminder job needs that. Here there is nothing to be atomic
    // with — the payment is committed and published — so the plain client is the
    // honest argument.
    //
    // No de-duplication, for the same reason the customer's bell has none: the
    // `paid` move is published from a transaction that matched on the previous
    // status, so it happens exactly once per order.
    const notification = await this.notifications.record(this.prisma, {
      branchId: order.branchId,
      type: StaffNotificationType.order_placed,
      orderId: event.orderId,
      payload,
    });

    this.notifications.publish({
      id: notification.id,
      branchId: order.branchId,
      type: StaffNotificationType.order_placed,
      orderId: event.orderId,
      // Thin on the wire, like every other arrival: the frame says a branch was
      // told something, and reading the list is what checks reach and answers
      // "have I seen this".
      payload: null,
      createdAt: notification.createdAt,
    });
  }
}
