import { Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrderEventsService, type OrderStatusEvent } from '../orders/order-events.service';
import { CustomerNotificationEventsService } from './customer-notification-events.service';
import { shouldNotify, type OrderNotificationPayload } from './order-notifications';

/** What one notification looks like to a customer's bell. */
export interface CustomerNotificationItem {
  id: string;
  type: NotificationType;
  /** Null for the kinds a client renders itself — see `order-notifications.ts`.
   *  Populated only where the server authored the words (`promo`, `system`). */
  title: string | null;
  body: string | null;
  payload: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
}

@Injectable()
export class CustomerNotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CustomerNotificationsService.name);
  private unsubscribe?: () => void;

  constructor(
    private readonly prisma: PrismaService,
    private readonly orderEvents: OrderEventsService,
    private readonly events: CustomerNotificationEventsService,
  ) {}

  /**
   * Listens to the order stream rather than being called from the three places
   * that move an order (`orders.service`, and twice in `payments.service`).
   *
   * One subscription instead of three call sites is not merely tidier: the next
   * thing that moves an order — a cancellation job, an admin override — is
   * announced here for free, whereas a fourth call site is a thing to remember.
   * The events are published *after* the transaction commits, so a notification
   * can never describe a change that got rolled back.
   */
  onModuleInit(): void {
    this.unsubscribe = this.orderEvents.subscribe((event) => {
      // The listener is sync and the work is not. Without this the first failed
      // write would be an unhandled rejection, which takes the API down over a
      // bell.
      void this.onOrderMoved(event).catch((error: unknown) => {
        this.logger.error(
          `Could not record a notification for order ${event.orderId}: ${String(error)}`,
        );
      });
    });
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
  }

  private async onOrderMoved(event: OrderStatusEvent): Promise<void> {
    if (!shouldNotify(event.status)) {
      return;
    }

    const payload: OrderNotificationPayload = {
      orderId: event.orderId,
      code: event.code,
      status: event.status,
    };

    const row = await this.prisma.notification.create({
      data: {
        userId: event.userId,
        type: NotificationType.order,
        payload: payload as unknown as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        isRead: true,
        createdAt: true,
        // The preference rides back with the row it belongs to. Reading it in a
        // second query would be a second round trip on the hot path of every
        // order that moves, for one boolean the same statement can return.
        user: { select: { notifPush: true } },
      },
    });

    // **The row is written either way; what the switch turns off is the
    // interruption.** A bell is two things at once — a nudge now, and this
    // order's history when somebody opens it later — and "do not notify me" is
    // an answer about the first. Dropping the write instead would mean a
    // customer who turns notifications back on finds a hole where the last
    // fortnight went, which is not what they asked for.
    //
    // Today that costs the live frame over the socket. It is also the gate the
    // OS-level push will sit behind when `POST /devices` exists
    // (API_DOCUMENTATION.md), which is the case that made this worth fixing
    // first: a switch nobody reads is harmless until the day it is a phone
    // buzzing at somebody who said no.
    if (!row.user.notifPush) {
      return;
    }

    this.events.publish({
      id: row.id,
      userId: event.userId,
      type: row.type,
      title: row.title,
      body: row.body,
      payload: payload as unknown as Record<string, unknown>,
      isRead: row.isRead,
      createdAt: row.createdAt.toISOString(),
    });
  }

  /**
   * The bell: this account's notifications, newest first, with the unread count.
   *
   * The count is of *everything* unread, not of the page returned — a bell
   * showing "30" because that is where the page ended would be a lie the moment
   * somebody had thirty-one.
   */
  async list(
    userId: string,
    limit = 30,
  ): Promise<{ items: CustomerNotificationItem[]; unread: number }> {
    const [rows, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
      }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        type: row.type,
        title: row.title,
        body: row.body,
        payload: row.payload as Record<string, unknown> | null,
        isRead: row.isRead,
        createdAt: row.createdAt.toISOString(),
      })),
      unread,
    };
  }

  /**
   * Marks one notification read.
   *
   * `userId` is part of the `where` rather than checked afterwards, so another
   * account's id updates nothing and is reported as missing — the ids come from
   * a list the caller was shown, and one that did not would be a probe. The
   * same answer for "no such notification" and "not yours" is deliberate: a
   * distinguishable error would confirm the id exists.
   */
  async markRead(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });

    if (count === 0) {
      throw new NotFoundException('Notification not found');
    }
  }

  /**
   * Marks everything read, for the "clear the badge" gesture both clients need.
   *
   * Separate from `markRead` rather than an empty-ids special case: "all" is
   * not a list the client has to hold, and a bell opened on thirty items should
   * not send thirty ids to say one thing.
   */
  async markAllRead(userId: string): Promise<{ read: number }> {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { read: count };
  }

  /**
   * Throws one away.
   *
   * **A hard delete, deliberately.** Everywhere else in this schema a removal is
   * soft, because the row is a fact somebody may later have to account for — an
   * order, a staff assignment, a menu item that was on sale at the time. A
   * notification is not that: it is a *message about* a fact, and the fact
   * itself lives in `orders` and `order_events`, untouched. Keeping a
   * `deleted_at` here would mean keeping rows nobody can ever read again, to
   * preserve a copy of information that is preserved elsewhere anyway.
   *
   * Scoped by `userId` in the `where` rather than checked afterwards, so
   * another account's id deletes nothing and is reported as missing — the same
   * answer as for an id that never existed, because a distinguishable error
   * would confirm that it does.
   */
  async remove(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.notification.deleteMany({ where: { id, userId } });

    if (count === 0) {
      throw new NotFoundException('Notification not found');
    }
  }

  /**
   * Empties the bell.
   *
   * Everything, not only what has been read: the gesture is "I am done with all
   * of this", and a clear that quietly left the unread ones behind would look
   * like it had failed — which is worse than either behaviour done properly.
   * The badge going to zero is a consequence rather than the point.
   */
  async removeAll(userId: string): Promise<{ deleted: number }> {
    const { count } = await this.prisma.notification.deleteMany({ where: { userId } });
    return { deleted: count };
  }
}
