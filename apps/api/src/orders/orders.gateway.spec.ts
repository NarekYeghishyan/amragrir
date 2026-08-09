import { NotFoundException } from '@nestjs/common';
import { OrderStatus } from '@amragrir/shared';
import { OrdersGateway } from './orders.gateway';
import { OrderEventsService } from './order-events.service';
import { NotificationEventsService } from '../notifications/notification-events.service';
import { CustomerNotificationEventsService } from '../notifications/customer-notification-events.service';
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

  // The customer fan-out — a third emitter, because a bell is addressed to one
  // account rather than to an order or to a branch.
  const customerNotificationEvents = new CustomerNotificationEventsService();

  const gateway = new OrdersGateway(
    tokens,
    staffTokens,
    orders,
    events,
    notificationEvents,
    notifications,
    customerNotificationEvents,
  );
  gateway.onModuleInit();
  return {
    gateway,
    events,
    tokens,
    staffTokens,
    orders,
    notificationEvents,
    notifications,
    customerNotificationEvents,
  };
}

/** A verified customer, which is what `watchMe` requires. */
const verified = { sub: 'user-1', phoneVerified: true };

const notification = (over: Record<string, unknown> = {}) => ({
  id: 'notification-1',
  userId: 'user-1',
  type: 'order' as const,
  title: null,
  body: null,
  payload: { orderId: ORDER_ID, code: 'AMR-12344821', status: OrderStatus.Ready },
  isRead: false,
  createdAt: '2026-07-21T18:12:15.556Z',
  ...over,
});

describe('watchMe', () => {
  it('pushes this account notifications and no other account any', async () => {
    const { gateway, customerNotificationEvents } = build({ user: verified });
    const mine = fakeSocket();
    const theirs = fakeSocket();
    gateway.handleConnection(mine as never);
    gateway.handleConnection(theirs as never);

    await gateway.onWatchMe(mine as never, { token: 'access' });

    customerNotificationEvents.publish(notification());

    expect(mine.sent).toEqual([{ event: 'notification', data: expect.objectContaining({ id: 'notification-1' }) }]);
    // The second socket never asked, so it has no account and hears nothing —
    // which is also every back-office panel's socket.
    expect(theirs.sent).toEqual([]);
    gateway.onModuleDestroy();
  });

  it('sends an account nothing that belongs to somebody else', async () => {
    const { gateway, customerNotificationEvents } = build({ user: verified });
    const socket = fakeSocket();
    gateway.handleConnection(socket as never);
    await gateway.onWatchMe(socket as never, { token: 'access' });

    customerNotificationEvents.publish(notification({ userId: 'user-2' }));

    expect(socket.sent).toEqual([]);
    gateway.onModuleDestroy();
  });

  it('refuses a guest, the same answer GET /notifications gives', async () => {
    // "May you call this" and "may you hold this open" have to agree, or the
    // socket is a way around the REST rule rather than a second route to it.
    const { gateway, customerNotificationEvents } = build({
      user: { sub: 'user-1', phoneVerified: false },
    });
    const socket = fakeSocket();
    gateway.handleConnection(socket as never);

    const reply = await gateway.onWatchMe(socket as never, { token: 'access' });

    expect(reply).toEqual({ event: 'error', data: { message: 'A verified phone is required' } });
    customerNotificationEvents.publish(notification());
    expect(socket.sent).toEqual([]);
    gateway.onModuleDestroy();
  });

  it('refuses a token that does not verify', async () => {
    const { gateway } = build({ user: null });
    const socket = fakeSocket();
    gateway.handleConnection(socket as never);

    const reply = await gateway.onWatchMe(socket as never, { token: 'nonsense' });

    expect(reply).toEqual({ event: 'error', data: { message: 'Invalid or expired token' } });
    gateway.onModuleDestroy();
  });

  it('stops listening when the module goes down', () => {
    // A gateway that kept its subscription would go on writing to sockets from
    // a torn-down module — and in tests, leak a listener per `build()`.
    const { gateway, customerNotificationEvents } = build({ user: verified });
    gateway.onModuleDestroy();

    expect(() => customerNotificationEvents.publish(notification())).not.toThrow();
  });
});

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
