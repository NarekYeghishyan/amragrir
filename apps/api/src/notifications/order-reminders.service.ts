import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrderStatus, StaffNotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { pickupCodeFrom } from '../orders/order-code';
import { StaffNotificationsService } from './staff-notifications.service';

/**
 * How many due reminders one pass will send.
 *
 * A ceiling rather than a page: the scan runs every minute and anything left
 * over is picked up on the next one, so the only thing this bounds is how much
 * work a single tick can do after an outage has let a backlog build.
 */
const BATCH = 200;

/**
 * The lock every instance competes for before scanning.
 *
 * Held slightly longer than the interval, so a pass that overruns does not hand
 * the next tick to a second instance while it is still working, and short enough
 * that a process killed mid-pass does not block the job for long.
 */
const LOCK_KEY = 'reminders:prep-due';
const LOCK_TTL_SECONDS = 90;

/**
 * Tells a branch that a pre-order is about to need cooking.
 *
 * **This is the API's first scheduled job.** Until pre-orders existed there was
 * nothing to run on a timer — which is why `QueueFilter.Unpaid` exists at all,
 * and that comment ("the API has no scheduled job of any kind") is now false for
 * this one case and still true for abandoned baskets.
 *
 * Polling a column rather than holding delayed jobs in Redis, deliberately. The
 * order is the source of truth; a queue entry scheduled seven days out would be
 * a second one, living somewhere a flush would empty, and the failure mode would
 * be a reminder that silently never comes. Here the worst an outage costs is a
 * late notification, and the board is unaffected either way — it splits on the
 * clock, never on whether this job ran.
 */
@Injectable()
export class OrderRemindersService {
  private readonly logger = new Logger(OrderRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly notifications: StaffNotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async sweep(): Promise<void> {
    // One instance does the pass. Without this every instance would send the
    // same reminder — `reminder_sent_at` would stop the *second* pass, but not
    // two passes running at the same moment.
    if (!(await this.redis.setIfAbsent(LOCK_KEY, String(process.pid), LOCK_TTL_SECONDS))) {
      return;
    }

    try {
      await this.send(new Date());
    } catch (err) {
      // Never rethrow out of a cron handler: an unhandled rejection here takes
      // the process with it, and a missed reminder is not worth an outage.
      this.logger.error('Prep reminder sweep failed', err as Error);
    }
  }

  /**
   * Sends every reminder that has come due.
   *
   * Takes `now` so a test can be a statement about time rather than a race
   * against it.
   */
  async send(now: Date): Promise<number> {
    const due = await this.prisma.order.findMany({
      where: {
        // The partial index this rides on covers exactly these two.
        reminderAt: { not: null, lte: now },
        reminderSentAt: null,
        // Nobody needs warning about an order that was never paid for, and
        // nothing to do about one already in the kitchen or called off.
        status: { in: [OrderStatus.paid, OrderStatus.confirmed] },
      },
      orderBy: { reminderAt: 'asc' },
      take: BATCH,
      select: {
        id: true,
        code: true,
        branchId: true,
        status: true,
        readyAt: true,
        prepStartAt: true,
        prepMin: true,
        reminderLeadMin: true,
        items: { select: { qty: true } },
      },
    });

    let sent = 0;
    for (const order of due) {
      try {
        const notification = await this.prisma.$transaction(async (tx) => {
          // Claim it by matching on the state this decision was made against, so
          // two passes racing cannot both send. A `where` that matches nothing
          // throws, and the transaction — notification included — rolls back.
          await tx.order.update({
            where: { id: order.id, reminderSentAt: null },
            data: { reminderSentAt: now },
          });

          return this.notifications.record(tx, {
            branchId: order.branchId,
            type: StaffNotificationType.prep_due,
            orderId: order.id,
            payload: {
              // Numbers, not a sentence: a job has no request to take a
              // language from, and the panel already translates.
              pickupCode: pickupCodeFrom(order.code),
              code: order.code,
              readyAt: order.readyAt?.toISOString() ?? null,
              prepStartAt: order.prepStartAt?.toISOString() ?? null,
              prepMin: order.prepMin,
              // The notice this branch asked for, so the bell can say "45 min
              // ahead" rather than leaving somebody to subtract two timestamps
              // to find out why they are hearing about it now.
              reminderLeadMin: order.reminderLeadMin,
              itemsCount: order.items.reduce((total, item) => total + item.qty, 0),
              // What still has to happen before anybody can cook it. A pre-order
              // nobody accepted is a different message from one that is waiting
              // on the kitchen alone.
              needsConfirming: order.status === OrderStatus.paid,
            },
          });
        });

        // Announced only once the transaction has committed. Publishing inside
        // it would tell a panel about a row that may still be rolled back.
        this.notifications.publish({
          id: notification.id,
          branchId: order.branchId,
          type: StaffNotificationType.prep_due,
          orderId: order.id,
          payload: null,
          createdAt: notification.createdAt,
        });
        sent += 1;
      } catch (err) {
        // One order failing must not cost the rest of the batch — the next pass
        // will find it again, because nothing was marked.
        this.logger.warn(
          `Could not raise the prep reminder for order ${order.id}: ${(err as Error).message}`,
        );
      }
    }

    if (sent > 0) {
      this.logger.log(`Raised ${sent} prep reminder(s)`);
    }
    return sent;
  }
}
