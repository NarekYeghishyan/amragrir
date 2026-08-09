import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import type { NotificationType } from '@prisma/client';

const CUSTOMER_NOTIFIED = 'customer.notified';

/**
 * What a customer's client is told when something lands in their bell.
 *
 * The same shape `GET /notifications` returns for one item, so a client can
 * unshift the frame straight into the list it is already holding instead of
 * re-fetching. A bell that refetched on every push would turn one order moving
 * through six stages into six list requests.
 */
export interface CustomerNotificationEvent {
  id: string;
  /** Who may hear it. The gateway authorises at `watchMe` time; this is the
   *  second check, so a socket cannot be handed another account's bell. */
  userId: string;
  type: NotificationType;
  title: string | null;
  body: string | null;
  payload: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
}

/**
 * In-process fan-out for customer notifications.
 *
 * A third emitter beside `OrderEventsService` and `NotificationEventsService`,
 * for the reason the second one exists: the three are addressed differently.
 * An order event goes to whoever is watching *that order*, a staff
 * notification to a *branch*, and this to *one account* — wherever they happen
 * to be in the app, which is the whole point of a bell. Folding them together
 * would make every subscriber filter a union to find its third.
 *
 * **The same thing breaks first here as there**: with a second API instance, a
 * browser connected to A would never hear about a status change made on B.
 * Swapping this for Redis pub/sub is a change to this file, which is why it is
 * a file.
 */
@Injectable()
export class CustomerNotificationEventsService {
  private readonly emitter = new EventEmitter();

  constructor() {
    // One listener per connected client, so the default cap of 10 would print a
    // leak warning at the eleventh customer with the site open.
    this.emitter.setMaxListeners(0);
  }

  publish(event: CustomerNotificationEvent): void {
    this.emitter.emit(CUSTOMER_NOTIFIED, event);
  }

  /** Registers a listener and returns the function that removes it. Returning
   *  the unsubscribe is what stops a disconnected socket leaking a listener. */
  subscribe(listener: (event: CustomerNotificationEvent) => void): () => void {
    this.emitter.on(CUSTOMER_NOTIFIED, listener);
    return () => this.emitter.off(CUSTOMER_NOTIFIED, listener);
  }
}
