import { Injectable, Optional, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import type { StaffNotificationType } from '@prisma/client';
import { RedisEventBus } from '../redis/redis-event-bus';

const STAFF_NOTIFIED = 'staff.notified';

/** Namespaced against a Redis shared with another project. */
const STAFF_NOTIFIED_CHANNEL = 'amragrir:staff.notified';

/**
 * What a panel is told when its branch gets a notification.
 *
 * Carries the numbers and not a sentence, for the same reason the row it comes
 * from does: a reminder is raised by a job, and a job has no request to take a
 * language from. The panel renders it through its own dictionary.
 */
export interface StaffNotificationEvent {
  id: string;
  /** Who may hear it. The gateway authorises at subscribe time; this is the
   *  second check, so a socket cannot be handed another branch's board. */
  branchId: string;
  type: StaffNotificationType;
  orderId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

/**
 * In-process fan-out for staff notifications.
 *
 * A second emitter beside `OrderEventsService` rather than a channel on it: the
 * two are addressed differently — an order status change goes to the customer
 * who placed it *and* the branch cooking it, while this goes to a branch and to
 * nobody else — and folding them together would mean every subscriber filtering
 * a union type to find the half it cares about.
 *
 * It lives in its own module so both the reminder job (which publishes) and the
 * orders gateway (which broadcasts) can depend on it without depending on each
 * other. A reminder raised on instance B now reaches a panel connected to A,
 * because `RedisEventBus` carries it across — see that file for why local
 * delivery does not itself go through Redis, and why the bus is optional.
 */
@Injectable()
export class NotificationEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly emitter = new EventEmitter();
  private unsubscribeBus?: () => void;

  constructor(@Optional() private readonly bus?: RedisEventBus) {
    // One listener per connected panel, so the default cap of 10 would print a
    // leak warning at the eleventh open board.
    this.emitter.setMaxListeners(0);
  }

  onModuleInit(): void {
    this.unsubscribeBus = this.bus?.subscribe(STAFF_NOTIFIED_CHANNEL, (event) => {
      this.emitter.emit(STAFF_NOTIFIED, event as StaffNotificationEvent);
    });
  }

  onModuleDestroy(): void {
    this.unsubscribeBus?.();
  }

  /** The panels held here first, the other instances after — a broker that is
   *  down must not cost this process its own board. */
  publish(event: StaffNotificationEvent): void {
    this.emitter.emit(STAFF_NOTIFIED, event);
    this.bus?.publish(STAFF_NOTIFIED_CHANNEL, event);
  }

  /** Registers a listener and returns the function that removes it. Returning
   *  the unsubscribe is what stops a disconnected socket leaking a listener. */
  subscribe(listener: (event: StaffNotificationEvent) => void): () => void {
    this.emitter.on(STAFF_NOTIFIED, listener);
    return () => this.emitter.off(STAFF_NOTIFIED, listener);
  }
}
