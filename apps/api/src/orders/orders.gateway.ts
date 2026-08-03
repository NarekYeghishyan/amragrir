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
import { StaffTokenService } from '../staff/staff-token.service';
import { OrdersService } from './orders.service';
import { OrderEventsService, type OrderStatusEvent } from './order-events.service';
import { StaffNotificationsService } from '../notifications/staff-notifications.service';
import {
  NotificationEventsService,
  type StaffNotificationEvent,
} from '../notifications/notification-events.service';

/** How often a ping goes out. A socket that misses two in a row is dropped. */
const HEARTBEAT_MS = 30_000;

interface SocketState {
  /** Orders this socket is watching. One socket, several orders — the orders
   *  list screen shows more than one countdown. */
  orders: Set<string>;
  /**
   * Branches this socket is being told about, for a back-office panel that
   * asked to watch them. Null until it does, and null forever for a customer.
   *
   * Separate from `orders` because the two answer different questions. An order
   * subscription is "tell me when *this* moves"; a branch subscription is "tell
   * me when something *arrives*" — and a prep reminder is almost always about an
   * order the panel has never seen, which is exactly why it needs telling.
   *
   * An empty set is a real answer (an account assigned to nothing); `allBranches`
   * is what a platform-wide account gets, because its reach is not a list.
   */
  branches: Set<string> | null;
  allBranches: boolean;
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
  private unsubscribeNotifications?: () => void;
  private heartbeat?: NodeJS.Timeout;

  constructor(
    private readonly tokens: TokenService,
    private readonly staffTokens: StaffTokenService,
    private readonly orders: OrdersService,
    private readonly events: OrderEventsService,
    private readonly notificationEvents: NotificationEventsService,
    private readonly notifications: StaffNotificationsService,
  ) {}

  onModuleInit(): void {
    this.unsubscribe = this.events.subscribe((event) => this.broadcast(event));
    this.unsubscribeNotifications = this.notificationEvents.subscribe((event) =>
      this.broadcastNotification(event),
    );

    // Without this, a socket killed by a dropped mobile connection is never
    // collected: TCP alone can keep a dead peer "open" for hours.
    this.heartbeat = setInterval(() => this.sweep(), HEARTBEAT_MS);
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
    this.unsubscribeNotifications?.();
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
    }
  }

  handleConnection(client: WebSocket): void {
    this.sockets.set(client, {
      orders: new Set(),
      branches: null,
      allBranches: false,
      alive: true,
    });
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

    // Either identity may watch an order: the customer who placed it, or the
    // kitchen working it. They carry different tokens, so both are tried —
    // whichever verifies decides which visibility rule applies.
    const user = await this.tokens.tryReadAccess(data.token);
    const staff = user ? null : await this.staffTokens.tryReadAccess(data.token);
    if (!user && !staff) {
      return error('Invalid or expired token');
    }

    let snapshot;
    try {
      snapshot = user
        ? await this.orders.findVisibleTo(user, data.orderId)
        : await this.orders.findVisibleToStaff(staff!, data.orderId);
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

  /**
   * `{ "event": "watchBranches", "data": { "token": "<staff access token>" } }`
   *
   * A back-office panel asking to be told when something arrives on its boards —
   * a prep reminder, so far. **Staff tokens only**: there is no branch a customer
   * may watch, and accepting one here would be handing out a restaurant's
   * operational feed to anybody with an account.
   *
   * The reach is resolved once, now, from the same `orders:read` scope the REST
   * board is filtered by, so a socket cannot be told about a branch its holder
   * could not open in the panel. It is a snapshot: a role granted while the
   * socket is open is picked up on the next connection, which is what a page
   * reload already does.
   */
  @SubscribeMessage('watchBranches')
  async onWatchBranches(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() data: { token?: string },
  ): Promise<{ event: string; data: unknown }> {
    if (!data?.token) {
      return error('token is required');
    }

    const staff = await this.staffTokens.tryReadAccess(data.token);
    if (!staff) {
      return error('Invalid or expired token');
    }

    const state = this.sockets.get(client);
    if (!state) {
      return error('Socket is not connected');
    }

    const reachable = await this.notifications.reachableBranchIds(staff);
    state.allBranches = reachable === null;
    state.branches = reachable === null ? new Set() : new Set(reachable);

    return {
      event: 'watchingBranches',
      data: { branches: state.allBranches ? 'all' : [...state.branches] },
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

  /**
   * Sends a branch notification to the panels watching that branch.
   *
   * Membership is checked against what the socket was authorised for at
   * `watchBranches` time — the second check, so a notification cannot reach a
   * board whose holder could not open it. A socket that never asked has
   * `branches: null` and hears nothing, which is every customer's socket.
   */
  private broadcastNotification(event: StaffNotificationEvent): void {
    const payload = JSON.stringify({
      event: 'notification',
      data: {
        id: event.id,
        branchId: event.branchId,
        type: event.type,
        orderId: event.orderId,
        createdAt: event.createdAt,
      },
    });

    for (const [socket, state] of this.sockets) {
      if (!state.allBranches && !state.branches?.has(event.branchId)) {
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
