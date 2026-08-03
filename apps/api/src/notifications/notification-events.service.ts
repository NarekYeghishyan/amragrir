import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import type { StaffNotificationType } from '@prisma/client';

const STAFF_NOTIFIED = 'staff.notified';

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
 * other. **The same thing breaks first here as there**: with a second API
 * instance a panel connected to A would never hear a reminder raised on B.
 * Swapping this for Redis pub/sub is a change to this file.
 */
@Injectable()
export class NotificationEventsService {
  private readonly emitter = new EventEmitter();

  constructor() {
    // One listener per connected panel, so the default cap of 10 would print a
    // leak warning at the eleventh open board.
    this.emitter.setMaxListeners(0);
  }

  publish(event: StaffNotificationEvent): void {
    this.emitter.emit(STAFF_NOTIFIED, event);
  }

  /** Registers a listener and returns the function that removes it. Returning
   *  the unsubscribe is what stops a disconnected socket leaking a listener. */
  subscribe(listener: (event: StaffNotificationEvent) => void): () => void {
    this.emitter.on(STAFF_NOTIFIED, listener);
    return () => this.emitter.off(STAFF_NOTIFIED, listener);
  }
}
