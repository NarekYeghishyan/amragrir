import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { WebSocket } from 'ws';
import { TokenService } from '../auth/token.service';
import { OrdersService } from './orders.service';
import { OrderEventsService, type OrderStatusEvent } from './order-events.service';

/** How often a ping goes out. A socket that misses two in a row is dropped. */
const HEARTBEAT_MS = 30_000;

interface SocketState {
  /** Orders this socket is watching. One socket, several orders — the orders
   *  list screen shows more than one countdown. */
  orders: Set<string>;
  /** Reset by every pong; a socket that fails to answer is assumed gone. */
  alive: boolean;
}

/**
 * Live order status for the tracking screen.
 *
 * **Authentication happens in the `subscribe` message, not the handshake.** A
 * browser cannot set an `Authorization` header on a WebSocket, and putting a
 * token in the query string writes it into every access log along the way. The
 * first message carries it instead, which also lets one socket subscribe to
 * several orders with a single connection.
 *
 * Polling `GET /orders/{id}` remains supported and returns the same fields —
 * this is an optimisation, not the only way to follow an order.
 */
@WebSocketGateway({ path: '/v1/orders/stream' })
export class OrdersGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(OrdersGateway.name);
  private readonly sockets = new Map<WebSocket, SocketState>();
  private unsubscribe?: () => void;
  private heartbeat?: NodeJS.Timeout;

  constructor(
    private readonly tokens: TokenService,
    private readonly orders: OrdersService,
    private readonly events: OrderEventsService,
  ) {}

  onModuleInit(): void {
    this.unsubscribe = this.events.subscribe((event) => this.broadcast(event));

    // Without this, a socket killed by a dropped mobile connection is never
    // collected: TCP alone can keep a dead peer "open" for hours.
    this.heartbeat = setInterval(() => this.sweep(), HEARTBEAT_MS);
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
    }
  }

  handleConnection(client: WebSocket): void {
    this.sockets.set(client, { orders: new Set(), alive: true });
    client.on('pong', () => {
      const state = this.sockets.get(client);
      if (state) {
        state.alive = true;
      }
    });
  }

  handleDisconnect(client: WebSocket): void {
    this.sockets.delete(client);
  }

  /**
   * `{ "event": "subscribe", "data": { "token": "<access token>", "orderId": "…" } }`
   *
   * The token is verified and the order is loaded through the same
   * visibility rule the REST endpoints use, so a socket cannot watch an order
   * its owner may not read.
   */
  @SubscribeMessage('subscribe')
  async onSubscribe(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() data: { token?: string; orderId?: string },
  ): Promise<{ event: string; data: unknown }> {
    if (!data?.token || !data?.orderId) {
      return error('token and orderId are required');
    }

    const user = await this.tokens.tryReadAccess(data.token);
    if (!user) {
      return error('Invalid or expired token');
    }

    let snapshot;
    try {
      snapshot = await this.orders.findVisibleTo(user, data.orderId);
    } catch {
      // Deliberately the same answer for "no such order" and "not yours" —
      // a distinguishable error would confirm the id exists.
      return error('Order not found');
    }

    this.sockets.get(client)?.orders.add(data.orderId);

    // Reply with the current state rather than only future changes: a client
    // that connects after the order moved would otherwise render stale data
    // until the next transition, which for a finished order is never.
    return {
      event: 'order',
      data: {
        orderId: snapshot.id,
        code: snapshot.code,
        status: snapshot.status,
        readyAt: snapshot.readyAt,
        secondsLeft: snapshot.secondsLeft,
      },
    };
  }

  @SubscribeMessage('unsubscribe')
  onUnsubscribe(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() data: { orderId?: string },
  ): { event: string; data: unknown } {
    if (data?.orderId) {
      this.sockets.get(client)?.orders.delete(data.orderId);
    }
    return { event: 'unsubscribed', data: { orderId: data?.orderId ?? null } };
  }

  private broadcast(event: OrderStatusEvent): void {
    const payload = JSON.stringify({
      event: 'order',
      data: {
        orderId: event.orderId,
        code: event.code,
        status: event.status,
        readyAt: event.readyAt,
        secondsLeft: event.secondsLeft,
      },
    });

    for (const [socket, state] of this.sockets) {
      if (!state.orders.has(event.orderId)) {
        continue;
      }
      try {
        socket.send(payload);
      } catch (err) {
        this.logger.warn(`Dropping a socket that could not be written to: ${String(err)}`);
        this.sockets.delete(socket);
      }
    }
  }

  private sweep(): void {
    for (const [socket, state] of this.sockets) {
      if (!state.alive) {
        this.sockets.delete(socket);
        socket.terminate();
        continue;
      }
      state.alive = false;
      socket.ping();
    }
  }
}

function error(message: string): { event: string; data: unknown } {
  return { event: 'error', data: { message } };
}
