import { Injectable } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import type { ReservationStatus } from '@amragrir/shared';
import { CustomerNotificationEventsService } from './customer-notification-events.service';
import {
  shouldNotifyReservation,
  type ReservationNotificationPayload,
} from './reservation-notifications';

/** One booking move, as the caller knows it. */
export interface ReservationMove {
  reservationId: string;
  /** Whose booking it is — the account the notification belongs to. */
  userId: string;
  status: ReservationStatus;
  reservedFor: Date;
}

/**
 * Telling a guest what a restaurant decided about their table.
 *
 * **Split in two, like `StaffNotificationsService`**: `record` takes a
 * transaction client and writes, `publish` announces afterwards. The staff path
 * moves a booking, writes an audit entry and now writes this, all inside one
 * transaction — a notification that survived a rolled-back move would tell
 * somebody their table was confirmed when it was not. Announcing has to wait
 * until that transaction commits, so it is a second call the caller makes when
 * it knows the write stuck.
 *
 * **Called rather than subscribed**, unlike the two order producers beside it.
 * Those listen to `OrderEventsService` because an order is moved from three
 * places and a fourth is coming; a booking is moved from exactly two — the
 * guest's own `cancel` and the staff `setStatus` — and *which of the two* is
 * the whole question here. A stream would flatten precisely the distinction
 * this needs: telling guests what they themselves just did is the mistake
 * `created` was kept silent to avoid.
 */
@Injectable()
export class ReservationNotificationsService {
  constructor(private readonly events: CustomerNotificationEventsService) {}

  /**
   * Writes the row, inside the caller's transaction, or nothing at all.
   *
   * Returns `null` for a move that is not news — `seated` with the guest at the
   * table, `completed` as they leave. The caller publishes only what it got
   * back, so "should this be announced" is answered once, here, rather than
   * once here and once at the call site.
   */
  async record(
    tx: Prisma.TransactionClient,
    move: ReservationMove,
  ): Promise<{ id: string; createdAt: Date; payload: ReservationNotificationPayload } | null> {
    if (!shouldNotifyReservation(move.status)) {
      return null;
    }

    const payload: ReservationNotificationPayload = {
      reservationId: move.reservationId,
      status: move.status,
      reservedFor: move.reservedFor.toISOString(),
    };

    const row = await tx.notification.create({
      data: {
        userId: move.userId,
        type: NotificationType.reservation,
        payload: payload as unknown as Prisma.InputJsonValue,
      },
      select: { id: true, createdAt: true },
    });

    return { id: row.id, createdAt: row.createdAt, payload };
  }

  /**
   * Announces a row that is now safely committed.
   *
   * The guest's `notif_push` is honoured here exactly as it is for an order:
   * the row is written whatever the switch says, because the bell is this
   * booking's history, and the switch decides only whether anybody is
   * interrupted about it. See BUSINESS_LOGIC.md §4.
   */
  publish(
    written: { id: string; createdAt: Date; payload: ReservationNotificationPayload },
    move: ReservationMove,
    notifPush: boolean,
  ): void {
    if (!notifPush) {
      return;
    }

    this.events.publish({
      id: written.id,
      userId: move.userId,
      type: NotificationType.reservation,
      // No prose: the clients draw these from `RESERVATION_NOTIFICATION_COPY`.
      title: null,
      body: null,
      payload: written.payload as unknown as Record<string, unknown>,
      isRead: false,
      createdAt: written.createdAt.toISOString(),
    });
  }
}
