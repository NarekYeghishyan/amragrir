import type { OrderStatus, StaffNotificationType } from '@amragrir/shared';
import { streamUrl, tokens } from './api';

export interface OrderUpdate {
  orderId: string;
  code: string;
  status: OrderStatus;
  readyAt: string | null;
  secondsLeft: number | null;
}

/**
 * A branch being told something, as it arrives.
 *
 * Deliberately thin — an id, a branch, a kind. It is a signal that the bell
 * should re-read, not the row itself: the list endpoint is where reach is
 * checked and where "have *I* seen this" is answered, and a socket frame
 * carrying the whole notification would be a second, unchecked way to learn what
 * a branch was told.
 */
export interface NotificationArrival {
  id: string;
  branchId: string;
  type: StaffNotificationType;
  orderId: string | null;
  createdAt: string;
}

const RETRY_MS = [1_000, 2_000, 5_000, 10_000];

/**
 * Watches a set of orders on one socket.
 *
 * The kitchen board follows every active order at once, which is why the
 * protocol subscribes per order over a single connection rather than opening
 * one socket each. `orderIds` changes as orders arrive and finish, so the
 * subscription set is re-sent rather than the socket rebuilt.
 */
export function watchOrders(
  orderIds: string[],
  onUpdate: (update: OrderUpdate) => void,
  onConnectionChange?: (connected: boolean) => void,
): { setOrders: (ids: string[]) => void; close: () => void } {
  let socket: WebSocket | null = null;
  let watched = new Set(orderIds);
  let subscribed = new Set<string>();
  let retry = 0;
  let timer: number | null = null;
  let closed = false;

  const subscribeMissing = (): void => {
    if (socket?.readyState !== WebSocket.OPEN) {
      return;
    }
    for (const id of watched) {
      if (!subscribed.has(id)) {
        socket.send(
          JSON.stringify({ event: 'subscribe', data: { token: tokens.access, orderId: id } }),
        );
        subscribed.add(id);
      }
    }
  };

  const connect = (): void => {
    if (closed) {
      return;
    }
    socket = new WebSocket(streamUrl());

    socket.onopen = () => {
      retry = 0;
      // A reconnected socket knows nothing about the old subscriptions, so
      // they all have to be sent again — tracking that separately is what
      // stops a reconnect from silently watching nothing.
      subscribed = new Set();
      onConnectionChange?.(true);
      subscribeMissing();
    };

    socket.onmessage = (event) => {
      let message: { event?: string; data?: unknown };
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (message.event === 'order') {
        onUpdate(message.data as OrderUpdate);
      }
    };

    socket.onclose = () => {
      onConnectionChange?.(false);
      if (closed) {
        return;
      }
      const delay = RETRY_MS[Math.min(retry, RETRY_MS.length - 1)]!;
      retry += 1;
      timer = window.setTimeout(connect, delay);
    };

    // `onclose` always follows an error and owns the retry; handling both
    // would schedule two reconnects for one failure.
    socket.onerror = () => socket?.close();
  };

  connect();

  return {
    setOrders: (ids) => {
      watched = new Set(ids);
      subscribeMissing();
    },
    close: () => {
      closed = true;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
      socket?.close();
    },
  };
}

/**
 * Watches every branch this account can reach, for the shell's bell.
 *
 * A second socket rather than a channel on the board's, because the two have
 * different lifetimes: the board's opens when somebody looks at the queue and
 * closes when they leave it, and a reminder is worth hearing precisely while
 * they are looking at something else. Sharing one would mean the bell went deaf
 * on every screen but Orders.
 *
 * The reach is resolved by the API from the same `orders:read` scope the board
 * is filtered by, so what arrives here is never wider than what its holder could
 * open — and re-sent on every reconnect, since a new socket has been told
 * nothing.
 */
export function watchNotifications(
  onArrival: (arrival: NotificationArrival) => void,
  onConnectionChange?: (connected: boolean) => void,
): { close: () => void } {
  let socket: WebSocket | null = null;
  let retry = 0;
  let timer: number | null = null;
  let closed = false;

  const connect = (): void => {
    if (closed) {
      return;
    }
    socket = new WebSocket(streamUrl());

    socket.onopen = () => {
      retry = 0;
      onConnectionChange?.(true);
      socket?.send(JSON.stringify({ event: 'watchBranches', data: { token: tokens.access } }));
    };

    socket.onmessage = (event) => {
      let message: { event?: string; data?: unknown };
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (message.event === 'notification') {
        onArrival(message.data as NotificationArrival);
      }
    };

    socket.onclose = () => {
      onConnectionChange?.(false);
      if (closed) {
        return;
      }
      const delay = RETRY_MS[Math.min(retry, RETRY_MS.length - 1)]!;
      retry += 1;
      timer = window.setTimeout(connect, delay);
    };

    socket.onerror = () => socket?.close();
  };

  connect();

  return {
    close: () => {
      closed = true;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
      socket?.close();
    },
  };
}
