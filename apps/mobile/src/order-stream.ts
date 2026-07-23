import { getAccessToken, wsUrl } from './api/client';
import type { OrderStatusUpdate } from './api/types';

/**
 * Live order status over the WebSocket described in API_DOCUMENTATION.md.
 *
 * The token goes in the first message rather than a header, because a
 * WebSocket handshake cannot carry one — the server is built around that.
 *
 * A phone loses its connection constantly (backgrounding, tunnel, lift), so
 * reconnecting is not an optional extra here; without it the tracking screen
 * silently stops updating and looks like a stuck order.
 */

/** Backoff between reconnects, capped so a long outage does not stop retrying. */
const RETRY_MS = [1_000, 2_000, 5_000, 10_000, 15_000];

export interface OrderStreamHandlers {
  onUpdate: (update: OrderStatusUpdate) => void;
  /** Reports connection state so the screen can say "reconnecting…" rather
   *  than showing a countdown that is quietly no longer live. */
  onConnectionChange?: (connected: boolean) => void;
}

export function subscribeToOrder(orderId: string, handlers: OrderStreamHandlers): () => void {
  let socket: WebSocket | null = null;
  let retry = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const connect = (): void => {
    if (closed) {
      return;
    }

    socket = new WebSocket(wsUrl('/orders/stream'));

    socket.onopen = () => {
      retry = 0;
      handlers.onConnectionChange?.(true);
      socket?.send(
        JSON.stringify({
          event: 'subscribe',
          data: { token: getAccessToken(), orderId },
        }),
      );
    };

    socket.onmessage = (event: MessageEvent) => {
      let message: { event?: string; data?: unknown };
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (message.event === 'order') {
        handlers.onUpdate(message.data as OrderStatusUpdate);
      }
      // An `error` frame is left to the caller's polling fallback: the screen
      // already loaded the order over REST, so a refused subscription degrades
      // to "no live updates" rather than an empty screen.
    };

    socket.onclose = () => {
      handlers.onConnectionChange?.(false);
      if (closed) {
        return;
      }
      const delay = RETRY_MS[Math.min(retry, RETRY_MS.length - 1)]!;
      retry += 1;
      timer = setTimeout(connect, delay);
    };

    socket.onerror = () => {
      // `onclose` always follows, and that is where the retry lives — handling
      // it in both places would schedule two reconnects for one failure.
      socket?.close();
    };
  };

  connect();

  return () => {
    closed = true;
    if (timer) {
      clearTimeout(timer);
    }
    socket?.close();
  };
}
