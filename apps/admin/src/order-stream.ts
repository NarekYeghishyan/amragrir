import type { OrderStatus } from '@amragrir/shared';
import { streamUrl, tokens } from './api';

export interface OrderUpdate {
  orderId: string;
  code: string;
  status: OrderStatus;
  readyAt: string | null;
  secondsLeft: number | null;
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
