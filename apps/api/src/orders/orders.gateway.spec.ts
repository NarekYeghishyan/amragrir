import { NotFoundException } from '@nestjs/common';
import { OrderStatus } from '@amragrir/shared';
import { OrdersGateway } from './orders.gateway';
import { OrderEventsService } from './order-events.service';
import { NotificationEventsService } from '../notifications/notification-events.service';
import type { StaffNotificationsService } from '../notifications/staff-notifications.service';
import type { OrdersService } from './orders.service';
import type { TokenService } from '../auth/token.service';
import type { StaffTokenService } from '../staff/staff-token.service';

const ORDER_ID = 'order-1';

const snapshot = (over: Record<string, unknown> = {}) => ({
  id: ORDER_ID,
  code: 'AMR-12344821',
  status: OrderStatus.Preparing,
  readyAt: '2026-07-21T18:12:15.556Z',
  secondsLeft: 480,
  ...over,
});

/** Stands in for a `ws` socket: records what was sent and answers pings. */
function fakeSocket() {
  return {
    sent: [] as unknown[],
    handlers: new Map<string, () => void>(),
    send(payload: string) {
      this.sent.push(JSON.parse(payload));
    },
    on(event: string, handler: () => void) {
      this.handlers.set(event, handler);
    },
    ping: jest.fn(),
    terminate: jest.fn(),
  };
}

function build(
  options: {
    user?: unknown;
    staff?: unknown;
    findVisible?: jest.Mock;
    findStaff?: jest.Mock;
    /** Branches a panel may hear about; `null` is a platform-wide account. */
    branches?: string[] | null;
  } = {},
) {
  const events = new OrderEventsService();
  const tokens = {
    tryReadAccess: jest
      .fn()
      .mockResolvedValue(options.user === undefined ? { sub: 'user-1' } : options.user),
  } as unknown as TokenService;
  // The kitchen watches the same orders with a different token, so the
  // handshake tries both identities.
  const staffTokens = {
    tryReadAccess: jest.fn().mockResolvedValue(options.staff ?? null),
  } as unknown as StaffTokenService;
  const orders = {
    findVisibleTo: options.findVisible ?? jest.fn().mockResolvedValue(snapshot()),
    findVisibleToStaff: options.findStaff ?? jest.fn().mockResolvedValue(snapshot()),
  } as unknown as OrdersService;

  // The staff notification fan-out, and the service that says which branches a
  // panel may hear about. Separate from `events` above because the two are
  // addressed differently: an order change goes to whoever is watching that
  // order, a reminder goes to a branch.
  const notificationEvents = new NotificationEventsService();
  const notifications = {
    reachableBranchIds: jest.fn().mockResolvedValue(options.branches ?? ['branch-1']),
  } as unknown as StaffNotificationsService;

  const gateway = new OrdersGateway(
    tokens,
    staffTokens,
    orders,
    events,
    notificationEvents,
    notifications,
  );
  gateway.onModuleInit();
  return { gateway, events, tokens, staffTokens, orders, notificationEvents, notifications };
}

describe('subscribe', () => {
  it('answers with the current state, not only future changes', async () => {
    // A client opening the tracking screen after the order moved would
    // otherwise render stale data until the next transition — which for a
    // finished order never comes.
    const { gateway } = build();
    const socket = fakeSocket();
    gateway.handleConnection(socket as never);

    const reply = await gateway.onSubscribe(socket as never, {
      token: 'access',
      orderId: ORDER_ID,
    });

    expect(reply).toEqual({
      event: 'order',
      data: {
        orderId: ORDER_ID,
        code: 'AMR-12344821',
        status: OrderStatus.Preparing,
        readyAt: '2026-07-21T18:12:15.556Z',
        secondsLeft: 480,
      },
    });
    gateway.onModuleDestroy();
  });

  it('pushes later changes to a subscribed socket', async () => {
    const { gateway, events } = build();
    const socket = fakeSocket();
    gateway.handleConnection(socket as never);
    await gateway.onSubscribe(socket as never, { token: 'access', orderId: ORDER_ID });

    events.publish({
      orderId: ORDER_ID,
      userId: 'user-1',
      branchId: 'branch-1',
      code: 'AMR-12344821',
      status: OrderStatus.Ready,
      readyAt: null,
      secondsLeft: null,
    });

    expect(socket.sent).toEqual([
      {
        event: 'order',
        data: {
          orderId: ORDER_ID,
          code: 'AMR-12344821',
          status: OrderStatus.Ready,
          readyAt: null,
          secondsLeft: null,
        },
      },
    ]);
    gateway.onModuleDestroy();
  });

  it('sends nothing about an order the socket never subscribed to', async () => {
    const { gateway, events } = build();
    const socket = fakeSocket();
    gateway.handleConnection(socket as never);
    await gateway.onSubscribe(socket as never, { token: 'access', orderId: ORDER_ID });

    events.publish({
      orderId: 'someone-elses-order',
      userId: 'user-2',
      branchId: 'branch-1',
      code: 'AMR-00000000',
      status: OrderStatus.Ready,
      readyAt: null,
      secondsLeft: null,
    });

    expect(socket.sent).toEqual([]);
    gateway.onModuleDestroy();
  });

  it('refuses an invalid token', async () => {
    const { gateway } = build({ user: null });
    const socket = fakeSocket();
    gateway.handleConnection(socket as never);

    const reply = await gateway.onSubscribe(socket as never, { token: 'nope', orderId: ORDER_ID });

    expect(reply.event).toBe('error');
    gateway.onModuleDestroy();
  });

  it('gives the same answer for a missing order and someone elses', async () => {
    // A distinguishable error would confirm the id exists.
    const findVisible = jest.fn().mockRejectedValue(new NotFoundException());
    const { gateway, events } = build({ findVisible });
    const socket = fakeSocket();
    gateway.handleConnection(socket as never);

    const reply = await gateway.onSubscribe(socket as never, {
      token: 'access',
      orderId: ORDER_ID,
    });

    expect(reply).toEqual({ event: 'error', data: { message: 'Order not found' } });

    // And crucially, it is not subscribed afterwards.
    events.publish({
      orderId: ORDER_ID,
      userId: 'user-2',
      branchId: 'b',
      code: 'AMR-1',
      status: OrderStatus.Ready,
      readyAt: null,
      secondsLeft: null,
    });
    expect(socket.sent).toEqual([]);
    gateway.onModuleDestroy();
  });

  it('requires both a token and an order id', async () => {
    const { gateway } = build();
    const socket = fakeSocket();
    gateway.handleConnection(socket as never);

    expect((await gateway.onSubscribe(socket as never, { orderId: ORDER_ID })).event).toBe('error');
    expect((await gateway.onSubscribe(socket as never, { token: 'access' })).event).toBe('error');
    gateway.onModuleDestroy();
  });
});

describe('lifecycle', () => {
  it('stops sending to a disconnected socket', async () => {
    const { gateway, events } = build();
    const socket = fakeSocket();
    gateway.handleConnection(socket as never);
    await gateway.onSubscribe(socket as never, { token: 'access', orderId: ORDER_ID });
    gateway.handleDisconnect(socket as never);

    events.publish({
      orderId: ORDER_ID,
      userId: 'user-1',
      branchId: 'b',
      code: 'AMR-1',
      status: OrderStatus.Ready,
      readyAt: null,
      secondsLeft: null,
    });

    expect(socket.sent).toEqual([]);
    gateway.onModuleDestroy();
  });

  it('unsubscribes on request', async () => {
    const { gateway, events } = build();
    const socket = fakeSocket();
    gateway.handleConnection(socket as never);
    await gateway.onSubscribe(socket as never, { token: 'access', orderId: ORDER_ID });
    gateway.onUnsubscribe(socket as never, { orderId: ORDER_ID });

    events.publish({
      orderId: ORDER_ID,
      userId: 'user-1',
      branchId: 'b',
      code: 'AMR-1',
      status: OrderStatus.Ready,
      readyAt: null,
      secondsLeft: null,
    });

    expect(socket.sent).toEqual([]);
    gateway.onModuleDestroy();
  });

  it('releases its listener on shutdown, so the emitter does not leak', () => {
    const { gateway, events } = build();
    const before = events['emitter'].listenerCount('order.changed');
    gateway.onModuleDestroy();

    expect(before).toBe(1);
    expect(events['emitter'].listenerCount('order.changed')).toBe(0);
  });
});
