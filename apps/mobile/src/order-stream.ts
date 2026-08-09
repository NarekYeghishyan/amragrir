import { getAccessToken, wsUrl } from './api/client';
import type { NotificationItem, OrderStatusUpdate } from './api/types';

/**
 * Live updates over the WebSocket described in API_DOCUMENTATION.md.
 *
 * The token goes in the first message rather than a header, because a
 * WebSocket handshake cannot carry one — the server is built around that.
 *
 * A phone loses its connection constantly (backgrounding, tunnel, lift), so
 * reconnecting is not an optional extra here; without it a screen silently
 * stops updating and looks like a stuck order.
 *
 * Two subscriptions share this socket's plumbing: `subscribeToOrder` follows
 * one order for the tracking screen, and `subscribeToMyNotifications` follows
 * everything of this account's for the bell. They differ only in the frame they
 * open with and the frame they listen for, which is why the reconnect logic
 * below is written once — a second copy is a second place for the backoff to be
 * wrong.
 */

/** Backoff between reconnects, capped so a long outage does not stop retrying. */
const RETRY_MS = [1_000, 2_000, 5_000, 10_000, 15_000];

export interface StreamHandlers {
  /** Reports connection state so a screen can say "reconnecting…" rather
   *  than showing a countdown that is quietly no longer live. */
  onConnectionChange?: (connected: boolean) => void;
}

/**
 * Opens a reconnecting socket, sends `open()` on every connect, and hands each
 * frame to `onFrame`.
 *
 * `open` is called per connection rather than captured once because the access
 * token may have been rotated since the last one — a reconnect after fifteen
 * minutes asleep would otherwise re-subscribe with a token the server has
 * stopped accepting, and fail silently.
 */
function openStream(
  open: () => Record<string, unknown> | null,
  onFrame: (event: string, data: unknown) => void,
  handlers: StreamHandlers,
): () => void {
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
      const message = open();
      if (message) {
        socket?.send(JSON.stringify(message));
      }
    };

    socket.onmessage = (event: MessageEvent) => {
      let message: { event?: string; data?: unknown };
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (message.event) {
        onFrame(message.event, message.data);
      }
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

export interface OrderStreamHandlers extends StreamHandlers {
  onUpdate: (update: OrderStatusUpdate) => void;
}

export function subscribeToOrder(orderId: string, handlers: OrderStreamHandlers): () => void {
  return openStream(
    () => ({ event: 'subscribe', data: { token: getAccessToken(), orderId } }),
    (event, data) => {
      if (event === 'order') {
        handlers.onUpdate(data as OrderStatusUpdate);
      }
      // An `error` frame is left to the caller's polling fallback: the screen
      // already loaded the order over REST, so a refused subscription degrades
      // to "no live updates" rather than an empty screen.
    },
    handlers,
  );
}

export interface NotificationStreamHandlers extends StreamHandlers {
  onNotification: (item: NotificationItem) => void;
}

/**
 * Everything of this account's, wherever the reader is in the app.
 *
 * The bell's counterpart to `subscribeToOrder`, and the reason the bell is not
 * just the tracking screen: that screen reports the one order it is showing,
 * and somebody browsing for their next meal was hearing nothing.
 *
 * Refused for a guest — the server answers an `error` frame, which is left to
 * the same fallback as above: the bell keeps whatever `GET /notifications`
 * returned and simply does not update live.
 */
export function subscribeToMyNotifications(handlers: NotificationStreamHandlers): () => void {
  return openStream(
    () => {
      const token = getAccessToken();
      // Nothing to subscribe with. The socket stays open and reconnecting, so
      // signing in mid-session is picked up on the next connect rather than
      // needing the screen to be reopened.
      return token ? { event: 'watchMe', data: { token } } : null;
    },
    (event, data) => {
      if (event === 'notification') {
        handlers.onNotification(data as NotificationItem);
      }
    },
    handlers,
  );
}
