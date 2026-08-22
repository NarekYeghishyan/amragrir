import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationType, Prisma, ReservationStatus } from '@prisma/client';
import { BOOKING_REMINDER_LEAD_MINUTES } from '@amragrir/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CustomerNotificationEventsService } from './customer-notification-events.service';

/**
 * How many due reminders one pass will send.
 *
 * A ceiling rather than a page, for the reason the prep sweep has one: the scan
 * runs every minute and the remainder is picked up on the next tick, so this
 * bounds only how much a single pass does after an outage has left a backlog.
 */
const BATCH = 200;

const LOCK_KEY = 'reminders:booking-soon';
const LOCK_TTL_SECONDS = 90;

/**
 * Reminding a guest that their table is coming up.
 *
 * The half of the booking bell that nothing else could cover. Everything else a
 * guest is told is a *decision somebody made* — confirmed, cancelled, recorded
 * as a no-show — and each of those has a moment and a mover. A reminder has
 * neither: nobody does anything three hours before dinner, which is exactly why
 * it has to be a job.
 *
 * **Polling a column rather than scheduling a delayed job**, the same trade
 * `OrderRemindersService` makes and for the same reason: the booking is the
 * source of truth, and a queue entry scheduled three weeks out would be a
 * second one, living somewhere a flush would empty, failing silently. Here the
 * worst an outage costs is a late reminder, or none — and a reminder that has
 * missed its sitting is deliberately not sent at all.
 */
@Injectable()
export class BookingRemindersService {
  private readonly logger = new Logger(BookingRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly events: CustomerNotificationEventsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async sweep(): Promise<void> {
    // One instance does the pass. `reminder_sent_at` would stop the *second*
    // pass but not two passes running at the same moment, which is precisely
    // what several instances produce.
    if (!(await this.redis.setIfAbsent(LOCK_KEY, String(process.pid), LOCK_TTL_SECONDS))) {
      return;
    }

    try {
      await this.send(new Date());
    } catch (err) {
      // Never rethrow out of a cron handler: an unhandled rejection takes the
      // process with it, and a missed reminder is not worth an outage.
      this.logger.error('Booking reminder sweep failed', err as Error);
    }
  }

  /**
   * Sends every reminder that has come due.
   *
   * Takes `now` so a test can be a statement about time rather than a race
   * against it.
   */
  async send(now: Date): Promise<number> {
    const due = await this.prisma.reservation.findMany({
      where: {
        reminderSentAt: null,
        // Only a table the restaurant has actually promised. A `pending` one may
        // still be refused, and reminding somebody about a booking that is then
        // turned down is worse than saying nothing; the rest are over.
        status: ReservationStatus.confirmed,
        reservedFor: {
          lte: new Date(now.getTime() + BOOKING_REMINDER_LEAD_MINUTES * 60_000),
          // **Never remind about a sitting that has already begun.** After an
          // outage the backlog contains tables whose evening has passed, and
          // "your table is soon" arriving at midnight is worse than the silence
          // it replaces. Such rows simply fall out of this window rather than
          // being marked, so they keep a NULL `reminder_sent_at` for good — the
          // honest record, since nobody was ever reminded.
          gte: now,
        },
      },
      orderBy: { reservedFor: 'asc' },
      take: BATCH,
      select: {
        id: true,
        userId: true,
        reservedFor: true,
        // To decide whether this guest could possibly have forgotten — see the
        // filter below.
        createdAt: true,
        // The guest's answer about being interrupted, joined rather than asked
        // for per booking: this path already does a write each, and a query
        // each to read one boolean would double that for nothing.
        user: { select: { notifPush: true } },
      },
    });

    // **Somebody who booked inside the window does not need reminding.** A table
    // taken at five for seven is already within three hours of its sitting, so
    // the sweep would announce "your table is soon" a minute after they chose
    // it — telling somebody what they have just done, which is the mistake
    // `created` is kept silent on an order to avoid. The test is where the
    // booking was made relative to its own reminder point, not how recently:
    // "booked before there was anything to remind them of".
    const forgettable = due.filter(
      (booking) =>
        booking.createdAt.getTime() <
        booking.reservedFor.getTime() - BOOKING_REMINDER_LEAD_MINUTES * 60_000,
    );

    let sent = 0;
    for (const booking of forgettable) {
      try {
        const notification = await this.prisma.$transaction(async (tx) => {
          // Claim it by matching on the state this decision was made against, so
          // two passes racing cannot both send. A `where` that matches nothing
          // throws, and the transaction — notification included — rolls back.
          await tx.reservation.update({
            where: { id: booking.id, reminderSentAt: null },
            data: { reminderSentAt: now },
          });

          return this.write(tx, booking);
        });

        this.publish(booking, notification);
        sent += 1;
      } catch (err) {
        // One booking failing must not cost the rest of the batch — the next
        // pass finds it again, because nothing was marked.
        this.logger.warn(
          `Could not remind the guest about booking ${booking.id}: ${(err as Error).message}`,
        );
      }
    }

    if (sent > 0) {
      this.logger.log(`Sent ${sent} booking reminder(s)`);
    }
    return sent;
  }

  /** The row, written inside the claim's transaction. */
  private write(
    tx: Prisma.TransactionClient,
    booking: { id: string; userId: string; reservedFor: Date },
  ) {
    return tx.notification.create({
      data: {
        userId: booking.userId,
        type: NotificationType.reservation,
        payload: {
          reservationId: booking.id,
          // Still `confirmed` — a reminder does not move a booking. Carried
          // because every reservation row carries it and the clients read it
          // when `reminder` is absent.
          status: ReservationStatus.confirmed,
          reservedFor: booking.reservedFor.toISOString(),
          // What makes this a reminder rather than a confirmation. The clients
          // check it *before* looking anything up by status, because the status
          // has not changed and would otherwise draw "Your table is booked" at
          // somebody who booked it three weeks ago.
          reminder: true,
        },
        // A job has no request to take a language from, so it writes no prose —
        // the same rule the whole bell is built on.
      },
      select: { id: true, createdAt: true, isRead: true },
    });
  }

  /**
   * Announces a reminder that is now safely committed.
   *
   * The guest's switch governs this exactly as it governs every other bell in
   * the product: the row is written whatever it says — the bell is this
   * booking's history — and the switch decides only whether anybody is
   * interrupted about it. See BUSINESS_LOGIC.md §4.
   */
  private publish(
    booking: { id: string; userId: string; reservedFor: Date; user: { notifPush: boolean } },
    notification: { id: string; createdAt: Date; isRead: boolean },
  ): void {
    if (!booking.user.notifPush) {
      return;
    }

    this.events.publish({
      id: notification.id,
      userId: booking.userId,
      type: NotificationType.reservation,
      title: null,
      body: null,
      payload: {
        reservationId: booking.id,
        status: ReservationStatus.confirmed,
        reservedFor: booking.reservedFor.toISOString(),
        reminder: true,
      },
      isRead: notification.isRead,
      createdAt: notification.createdAt.toISOString(),
    });
  }
}
