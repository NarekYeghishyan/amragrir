/**
 * Dev seed — orders, and the history each one would have accumulated.
 *
 * The rest of the seed builds a platform with nothing sold in it: restaurants,
 * menus, tables and staff, and an order board that is empty on every fresh
 * database. Nothing about the kitchen queue, the status flow, the payment
 * states or the History dialog can be looked at until orders exist, and typing
 * them in through the API one at a time is how "it works on my database"
 * happens.
 *
 * Two things are seeded here:
 *
 * 1. **Orders per branch**, spread across the whole state machine, each written
 *    with the `order_events` it would have collected on the way — the same
 *    entries, in the same shapes, that `OrdersService` and `PaymentsService`
 *    write in production (see `src/orders/order-history.ts`).
 * 2. **History for orders that already existed.** The `order_events` migration
 *    backfilled a `created` entry for every order that predates the table, which
 *    is all their creation time could support. An order sitting in `completed`
 *    with a one-line timeline still says nothing about how it got there, so a
 *    second entry is reconstructed from the row itself — `system`, at
 *    `updated_at`, and flagged `reconstructed` so the panel says out loud that
 *    it was inferred rather than recorded. Guessing a name here would be worse
 *    than saying nothing: an audit trail that invents its actors is not one.
 *
 * Deterministic, like the rest of the seed: every choice comes from a hash of a
 * stable key, never from `Math.random`. "Random-looking" and "different every
 * run" are not the same thing, and the second one makes a bug somebody found
 * this morning unreproducible this afternoon.
 *
 * Idempotent: an order is keyed by its generated `code`, so a re-run finds the
 * ones it made last time and creates only what is missing.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  DEPOSIT_PER_GUEST_AMD,
  Language,
  OrderActorType,
  OrderEventType,
  OrderStatus,
  PICKUP_CODE_LENGTH,
  PaymentMethod,
  PaymentStatus,
  RESERVATION_SLOT_MINUTES,
  ReservationStatus,
  ServiceMode,
} from '@amragrir/shared';
import { localize, type I18nField } from '../src/common/i18n';
import { estimatePrepMinutes, priceLine, priceOrder } from '../src/orders/pricing';
import {
  orderEventData,
  type OrderActor,
  type OrderEventDetail,
} from '../src/orders/order-history';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** Bookable times land on this spacing. Rounding in UTC is rounding in local
 *  time here — Yerevan is UTC+4 all year, a whole number of hours. */
const RESERVATION_SLOT_MS = RESERVATION_SLOT_MINUTES * MINUTE_MS;

/** How many orders a branch gets. Enough for a board that looks worked. */
const ORDERS_PER_BRANCH = { min: 4, max: 7 } as const;

/** How far back the finished ones go. */
const HISTORY_DAYS = 21;

// ── deterministic randomness ────────────────────────────────────────────────

/**
 * A stable hash of a string — the same one the staff seed uses to pick a name.
 *
 * Duplicated deliberately rather than exported across the two files: it is four
 * lines, and an import in this direction would make the order seed depend on
 * the staff seed for something that is not about staff.
 */
function stableHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

/**
 * A pseudo-random source that is a pure function of its key.
 *
 * xorshift32: short, no dependency, and good enough for choosing a quantity.
 * The point is not statistical quality — it is that seeding the same database
 * twice, or two developers seeding theirs, produces the same orders.
 */
export interface Random {
  /** In [0, 1). */
  next(): number;
  /** Inclusive at both ends. */
  int(min: number, max: number): number;
  pick<T>(list: readonly T[]): T;
  /** True one time in `oneIn`. */
  chance(oneIn: number): boolean;
}

export function random(key: string): Random {
  // Never zero: xorshift is stuck there forever.
  let state = stableHash(key) || 0x9e37_79b9;

  const next = (): number => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };

  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));

  return {
    next,
    int,
    pick: <T>(list: readonly T[]): T => list[int(0, list.length - 1)] as T,
    chance: (oneIn: number): boolean => int(1, oneIn) === 1,
  };
}

// ── what a planned order looks like ─────────────────────────────────────────

export interface PlannedEvent {
  type: OrderEventType;
  actor: OrderActor;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus | null;
  detail?: OrderEventDetail;
  at: Date;
}

export interface PlannedOrder {
  /** The idempotency key: a re-run skips whatever is already in the database. */
  code: string;
  /** What a demo guest would show at the counter. Unique across the run, like
   *  the column it lands in. */
  pickupCode: string;
  userId: string;
  serviceMode: ServiceMode;
  status: OrderStatus;
  subtotalAmd: number;
  serviceFeeAmd: number;
  depositAmd: number;
  discountAmd: number;
  totalAmd: number;
  readyAt: Date;
  notes: string | null;
  createdAt: Date;
  /** The last thing that happened to it — not "now", or every order in the
   *  database would look as though it had just been touched. */
  updatedAt: Date;
  items: {
    menuItemId: string;
    nameSnapshot: string;
    unitPriceAmd: number;
    qty: number;
    lineTotalAmd: number;
  }[];
  payment: {
    method: PaymentMethod;
    amountAmd: number;
    status: PaymentStatus;
    providerRef: string | null;
  } | null;
  /** Dine-in only: the booking the order belongs to, created alongside it. */
  reservation: {
    tableId: string;
    reservedFor: Date;
    guests: number;
    depositAmd: number;
    depositCredited: boolean;
    status: ReservationStatus;
    /** Set only while the booking still holds the table — see the partial
     *  unique index on `reservations`. */
    activeSlot: Date | null;
  } | null;
  events: PlannedEvent[];
}

export interface PlannedCustomer {
  id: string;
  language: Language;
}

export interface BranchOrderPlan {
  /** Stable across databases: a fresh one gets the same orders, not merely a
   *  similar-looking set. Branch ids are generated per database and so cannot
   *  be the seed. */
  key: string;
  avgPrepMin: number | null;
  menu: { id: string; nameI18n: I18nField; priceAmd: number; prepMin: number | null }[];
  tables: { id: string; seats: number }[];
  reservationsEnabled: boolean;
  customers: PlannedCustomer[];
  /** Whoever works that branch. Empty is tolerated — the events then name the
   *  system rather than inventing a person. */
  staffIds: string[];
  /** Named as the human behind the rare impersonated entry. */
  supervisorId: string | null;
  now: number;
}

// ── the shape of a believable board ─────────────────────────────────────────

/** The happy path, in order. Cancellation leaves it; nothing else does. */
const LADDER: readonly OrderStatus[] = [
  OrderStatus.Created,
  OrderStatus.Paid,
  OrderStatus.Confirmed,
  OrderStatus.Preparing,
  OrderStatus.AlmostReady,
  OrderStatus.Ready,
  OrderStatus.Completed,
];

/** Just arrived: the "New" tab of the kitchen board. */
const ARRIVED: readonly OrderStatus[] = [
  OrderStatus.Created,
  OrderStatus.Paid,
  OrderStatus.Confirmed,
];

/** Being cooked: the tabs after it. */
const IN_KITCHEN: readonly OrderStatus[] = [
  OrderStatus.Preparing,
  OrderStatus.AlmostReady,
  OrderStatus.Ready,
];

/** Over. Weighted by repetition — most orders are eaten, some are called off. */
const SETTLED: readonly OrderStatus[] = [
  OrderStatus.Completed,
  OrderStatus.Completed,
  OrderStatus.Completed,
  OrderStatus.Completed,
  OrderStatus.Cancelled,
];

/** Minutes a step plausibly takes, keyed by the status it arrives at. */
const STEP_MINUTES: Readonly<Record<OrderStatus, readonly [number, number]>> = {
  [OrderStatus.Created]: [0, 0],
  [OrderStatus.Paid]: [1, 4],
  [OrderStatus.Confirmed]: [1, 5],
  [OrderStatus.Preparing]: [2, 7],
  [OrderStatus.AlmostReady]: [4, 11],
  [OrderStatus.Ready]: [3, 8],
  [OrderStatus.Completed]: [2, 14],
  [OrderStatus.Cancelled]: [3, 25],
} as const;

/** Card twice, so it comes out roughly half the orders — it is what most
 *  people tap, and a demo where the wallets dominate looks like a phone
 *  mock-up rather than a restaurant. */
const METHODS: readonly PaymentMethod[] = [
  PaymentMethod.Card,
  PaymentMethod.Card,
  PaymentMethod.ApplePay,
  PaymentMethod.GooglePay,
];

/** What a customer actually types into the notes box. */
const NOTES: readonly string[] = [
  'Առանց սոխի, խնդրում եմ',
  'No cutlery, thanks',
  'Please ring the bell — second floor',
  'Извините, без острого',
  'Երկու տոպրակով, նվեր է',
];

// ── planning ────────────────────────────────────────────────────────────────

/**
 * One branch's worth of orders, decided before anything is written.
 *
 * Pure — every input is an argument and the output is data — so the interesting
 * half (which statuses, in what order, with which history) is testable without
 * a database, and the writer below is left with nothing to decide.
 */
export function planBranchOrders(plan: BranchOrderPlan): PlannedOrder[] {
  if (plan.menu.length === 0 || plan.customers.length === 0) {
    return [];
  }

  const rng = random(plan.key);
  const count = rng.int(ORDERS_PER_BRANCH.min, ORDERS_PER_BRANCH.max);

  // Two live ones first, so every branch's board has something on it and the
  // "New" and "Preparing" tabs are never empty on a fresh database.
  const statuses: OrderStatus[] = [rng.pick(ARRIVED), rng.pick(IN_KITCHEN)];
  while (statuses.length < count) {
    statuses.push(rng.pick(SETTLED));
  }

  const orders: PlannedOrder[] = [];
  // Both codes are unique platform-wide, which is what the database enforces —
  // so the seed has to hold itself to it too, or a demo dataset fails to insert
  // on a constraint the application never trips.
  const codes = new Set<string>();
  const pickupCodes = new Set<string>();
  // `(table, slot)` is unique among live bookings — see `reservations`.
  const heldSlots = new Set<string>();

  for (const [index, status] of statuses.entries()) {
    const order = planOrder({
      plan,
      rng: random(`${plan.key}#${index}`),
      status,
      codes,
      pickupCodes,
      heldSlots,
    });
    codes.add(order.code);
    // Every order, live or finished — the column is unique across the whole
    // table, not just among the ones a counter is working on.
    pickupCodes.add(order.pickupCode);
    if (order.reservation?.activeSlot) {
      heldSlots.add(slotKey(order.reservation.tableId, order.reservation.activeSlot));
    }
    orders.push(order);
  }

  return orders;
}

function planOrder(input: {
  plan: BranchOrderPlan;
  rng: Random;
  status: OrderStatus;
  codes: ReadonlySet<string>;
  pickupCodes: ReadonlySet<string>;
  heldSlots: ReadonlySet<string>;
}): PlannedOrder {
  const { plan, rng, status } = input;

  const customer = rng.pick(plan.customers);
  const lines = pickLines(plan, rng, customer.language);

  // Decided before the money, because a table deposit is part of the bill; the
  // *times* wait until the order has one.
  const table =
    plan.reservationsEnabled && plan.tables.length > 0 && rng.chance(3)
      ? pickTable(plan, rng)
      : null;

  const totals = priceOrder(lines, table?.depositAmd ?? 0);
  const prepMin = estimatePrepMinutes(lines, plan.avgPrepMin);

  const path = statusPath(status);
  const gaps = path.slice(1).map((arrivedAt) => rng.int(...STEP_MINUTES[arrivedAt]));

  // A card that was refused before one that worked, and — for an order that
  // never got paid for — one that was refused and never retried. The second is
  // the whole reason `order_events.type = 'payment'` exists, and it is now the
  // story behind most cancelled orders: the card bounced and the customer gave
  // up rather than tried again.
  const paid = path.includes(OrderStatus.Paid);
  const declined =
    (paid && rng.chance(7)) || (!paid && rng.chance(4))
      ? rng.pick([...METHODS])
      : null;
  // Counted into the elapsed time rather than squeezed between two steps: a
  // refusal is why the retry came later, not a thing that happened beside it.
  const declineGap = declined === null ? 0 : rng.int(1, 3);
  const elapsedMin = gaps.reduce((sum, gap) => sum + gap, declineGap);

  // A finished order happened days ago; a live one is happening now, and its
  // whole history has to fit between its placement and this moment.
  const createdAt = isLive(status)
    ? new Date(plan.now - (elapsedMin + rng.int(1, 25)) * MINUTE_MS)
    : new Date(plan.now - rng.int(1, HISTORY_DAYS) * DAY_MS - rng.int(0, 600) * MINUTE_MS);

  const readyAt = new Date(createdAt.getTime() + prepMin * MINUTE_MS);
  const code = freshCode(rng, input.codes);
  const pickupCode = freshPickupCode(rng, input.pickupCodes);
  const seating =
    table === null ? null : planSeating(table, rng, status, createdAt, plan.now, input.heldSlots);

  // Every method is online, so a paid order is a captured one — there is no
  // longer a `pending` payment sitting on a live order waiting for somebody to
  // hand money over at a counter.
  const method = paid ? rng.pick(METHODS) : null;

  const events = planEvents({
    plan,
    rng,
    path,
    gaps,
    createdAt,
    declineGap,
    readyAt,
    serviceMode: seating ? ServiceMode.DineIn : ServiceMode.Pickup,
    itemsCount: lines.reduce((sum, line) => sum + line.qty, 0),
    totalAmd: totals.totalAmd,
    customerId: customer.id,
    payment: method === null ? null : { method, status: PaymentStatus.Captured },
    declined,
  });

  const paymentRow =
    method !== null
      ? {
          method,
          amountAmd: totals.totalAmd,
          status: PaymentStatus.Captured,
          providerRef: `dev_seed_${code.slice(4)}`,
        }
      : declined !== null
        ? // Refused and never retried: the row records the attempt, which is
          // what makes the order's silence explicable.
          { method: declined, amountAmd: totals.totalAmd, status: PaymentStatus.Failed, providerRef: null }
        : null;

  return {
    code,
    pickupCode,
    userId: customer.id,
    serviceMode: seating ? ServiceMode.DineIn : ServiceMode.Pickup,
    status,
    ...totals,
    readyAt,
    notes: rng.chance(3) ? rng.pick(NOTES) : null,
    createdAt,
    updatedAt: events[events.length - 1]?.at ?? createdAt,
    items: lines.map((line) => ({
      menuItemId: line.menuItemId,
      nameSnapshot: line.name,
      unitPriceAmd: line.unitPriceAmd,
      qty: line.qty,
      lineTotalAmd: line.lineTotalAmd,
    })),
    payment: paymentRow,
    reservation: seating,
    events,
  };
}

/**
 * The statuses an order passed through to reach the one it is in.
 *
 * A cancelled order has exactly one history now: cancellation is only legal
 * while an order is unpaid (BUSINESS_LOGIC.md §4), so it never got past the
 * first rung. That is also why this no longer needs the generator it used to
 * take — there is nothing left to choose.
 */
export function statusPath(status: OrderStatus): OrderStatus[] {
  if (status !== OrderStatus.Cancelled) {
    return LADDER.slice(0, LADDER.indexOf(status) + 1);
  }
  return [OrderStatus.Created, OrderStatus.Cancelled];
}

function planEvents(input: {
  plan: BranchOrderPlan;
  rng: Random;
  path: OrderStatus[];
  gaps: number[];
  createdAt: Date;
  /** Minutes the refusal below cost, already counted into the order's age. */
  declineGap: number;
  readyAt: Date;
  serviceMode: ServiceMode;
  itemsCount: number;
  totalAmd: number;
  customerId: string;
  payment: { method: PaymentMethod; status: PaymentStatus } | null;
  declined: PaymentMethod | null;
}): PlannedEvent[] {
  const { plan, rng, path, gaps, createdAt, totalAmd } = input;
  const customer: OrderActor = { type: OrderActorType.Customer, userId: input.customerId };

  // One shift handles an order, the way one would. The occasional entry names
  // the super admin behind an impersonated session, because that is the line
  // the panel renders and nothing else in dev produces one.
  const onShift = plan.staffIds.length > 0 ? rng.pick(plan.staffIds) : null;
  const staff: OrderActor =
    onShift === null
      ? { type: OrderActorType.System }
      : {
          type: OrderActorType.Staff,
          staffId: onShift,
          actingStaffId:
            plan.supervisorId !== null && rng.chance(23) ? plan.supervisorId : undefined,
        };

  const events: PlannedEvent[] = [
    {
      type: OrderEventType.Created,
      actor: customer,
      fromStatus: null,
      toStatus: OrderStatus.Created,
      detail: {
        serviceMode: input.serviceMode,
        itemsCount: input.itemsCount,
        totalAmd,
        readyAt: input.readyAt.toISOString(),
      },
      at: createdAt,
    },
  ];

  // The cursor every later entry hangs off, so nothing can be dated before the
  // thing it followed.
  let at = createdAt.getTime();

  if (input.declined !== null) {
    at += input.declineGap * MINUTE_MS;
    events.push({
      type: OrderEventType.Payment,
      actor: customer,
      fromStatus: null,
      toStatus: null,
      detail: {
        paymentMethod: input.declined,
        paymentStatus: PaymentStatus.Failed,
        amountAmd: totalAmd,
      },
      at: new Date(at),
    });
  }

  for (const [step, to] of path.slice(1).entries()) {
    at += (gaps[step] ?? 1) * MINUTE_MS;
    const from = path[step] as OrderStatus;

    events.push({
      type: OrderEventType.StatusChanged,
      // Paying is the customer's doing even though the provider moved the
      // money, and so is walking away from an order they never paid for —
      // which is now the only way one gets cancelled. Every other step is
      // somebody at the branch.
      actor: to === OrderStatus.Paid || to === OrderStatus.Cancelled ? customer : staff,
      fromStatus: from,
      toStatus: to,
      detail: statusDetail(to, input),
      at: new Date(at),
    });
  }

  return events;
}

/**
 * What became of the money, on the one transition that touches it.
 *
 * One, not two: a cancelled order was never paid for, so there is no reversal
 * to describe — the entry that explains it is the refused attempt above.
 */
function statusDetail(
  to: OrderStatus,
  input: {
    totalAmd: number;
    payment: { method: PaymentMethod; status: PaymentStatus } | null;
  },
): OrderEventDetail | undefined {
  if (to === OrderStatus.Paid && input.payment !== null) {
    return {
      paymentMethod: input.payment.method,
      paymentStatus: input.payment.status,
      amountAmd: input.totalAmd,
    };
  }
  return undefined;
}

// ── the pieces an order is made of ──────────────────────────────────────────

function pickLines(
  plan: BranchOrderPlan,
  rng: Random,
  language: Language,
): ReturnType<typeof priceLine>[] {
  const wanted = Math.min(rng.int(1, 3), plan.menu.length);
  const chosen = new Set<number>();
  while (chosen.size < wanted) {
    chosen.add(rng.int(0, plan.menu.length - 1));
  }

  return [...chosen].map((index) => {
    const item = plan.menu[index];
    return priceLine({
      menuItemId: item.id,
      // In the customer's own language, exactly as `OrdersService` snapshots
      // it: an order is a record of what was bought, under the name it was
      // bought as.
      name: localize(item.nameI18n, language),
      unitPriceAmd: item.priceAmd,
      // Two of a thing is ordinary, five is not.
      qty: rng.chance(6) ? rng.int(3, 4) : rng.int(1, 2),
      prepMin: item.prepMin,
    });
  });
}

/** A table and a party for it. Deposit per head, credited against the bill and
 *  never added to it — `priceOrder` is what guarantees the second half. */
function pickTable(
  plan: BranchOrderPlan,
  rng: Random,
): { id: string; guests: number; depositAmd: number } {
  const table = rng.pick(plan.tables);
  const guests = Math.max(1, Math.min(rng.int(2, 6), table.seats));
  return { id: table.id, guests, depositAmd: guests * DEPOSIT_PER_GUEST_AMD };
}

/**
 * When the table is booked for, and whether it is still held.
 *
 * `activeSlot` mirrors `reservedFor` while the booking is live and is null once
 * it is not, which is exactly what the unique index on `(table_id,
 * active_slot)` is built around: cancelling frees the slot instead of blocking
 * it forever. Setting the two to different times would be a lie the database
 * cannot catch.
 */
function planSeating(
  table: { id: string; guests: number; depositAmd: number },
  rng: Random,
  status: OrderStatus,
  createdAt: Date,
  now: number,
  heldSlots: ReadonlySet<string>,
): NonNullable<PlannedOrder['reservation']> {
  const live = isLive(status);

  // A live booking is for a table that is still coming up — the food was
  // pre-ordered ahead of sitting down. A finished one was for the evening the
  // order was placed on.
  let reservedFor = live
    ? new Date(nextSlot(now) + rng.int(0, 4) * RESERVATION_SLOT_MS)
    : new Date(createdAt.getTime() + rng.int(10, 40) * MINUTE_MS);

  if (live) {
    while (heldSlots.has(slotKey(table.id, reservedFor))) {
      reservedFor = new Date(reservedFor.getTime() + RESERVATION_SLOT_MS);
    }
  }

  return {
    tableId: table.id,
    reservedFor,
    guests: table.guests,
    depositAmd: table.depositAmd,
    depositCredited: status === OrderStatus.Completed,
    status: live
      ? ReservationStatus.Confirmed
      : status === OrderStatus.Completed
        ? ReservationStatus.Completed
        : ReservationStatus.Cancelled,
    activeSlot: live ? reservedFor : null,
  };
}

/** The next bookable half hour — the spacing the design's time picker implies. */
function nextSlot(now: number): number {
  return Math.ceil(now / RESERVATION_SLOT_MS) * RESERVATION_SLOT_MS;
}

function slotKey(tableId: string, slot: Date): string {
  return `${tableId}|${slot.toISOString()}`;
}

function isLive(status: OrderStatus): boolean {
  return status !== OrderStatus.Completed && status !== OrderStatus.Cancelled;
}

/** `AMR-` + 8 digits, the format `order-code.ts` generates and the column
 *  allows, avoiding the codes already planned in this run. */
function freshCode(rng: Random, codes: ReadonlySet<string>): string {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    let digits = '';
    for (let i = 0; i < 8; i += 1) {
      digits += String(rng.int(0, 9));
    }
    const code = `AMR-${digits}`;
    if (!codes.has(code)) {
      return code;
    }
  }
  throw new Error('Could not allocate a seed order code');
}

/**
 * The collection code — six digits, unrelated to the order code, unique across
 * the run.
 *
 * Drawn from the seed's own deterministic `rng` rather than `generatePickupCode`
 * so a seeded database is reproducible; the *shape* is the application's, taken
 * from the shared constant rather than a literal six written here.
 */
function freshPickupCode(rng: Random, pickupCodes: ReadonlySet<string>): string {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    let digits = '';
    for (let i = 0; i < PICKUP_CODE_LENGTH; i += 1) {
      digits += String(rng.int(0, 9));
    }
    if (!pickupCodes.has(digits)) {
      return digits;
    }
  }
  throw new Error('Could not allocate a seed pickup code');
}

// ── writing ─────────────────────────────────────────────────────────────────

/** Demo diners. Separate accounts from the staff, because they are separate
 *  people — a customer is a `users` row and always will be. */
const CUSTOMERS: readonly { phone: string; name: string; language: Language }[] = [
  { phone: '+37477000001', name: 'Ani Grigoryan', language: Language.Hy },
  { phone: '+37477000002', name: 'Aram Sargsyan', language: Language.Hy },
  { phone: '+37477000003', name: 'Lusine Hakobyan', language: Language.Hy },
  { phone: '+37477000004', name: 'Tigran Petrosyan', language: Language.Hy },
  { phone: '+37477000005', name: 'Mariam Vardanyan', language: Language.Hy },
  { phone: '+37477000006', name: 'Davit Manukyan', language: Language.Hy },
  { phone: '+37477000007', name: 'Anahit Harutyunyan', language: Language.Ru },
  { phone: '+37477000008', name: 'Gor Khachatryan', language: Language.Ru },
  { phone: '+37477000009', name: 'Nare Avetisyan', language: Language.Ru },
  { phone: '+37477000010', name: 'Hayk Mkrtchyan', language: Language.En },
  { phone: '+37477000011', name: 'Sona Poghosyan', language: Language.En },
  { phone: '+37477000012', name: 'Vahe Ghazaryan', language: Language.En },
];

/** The super admin the staff seed creates, named on impersonated entries. */
const SUPERVISOR_EMAIL = 'admin@amragrir.local';

export async function seedOrders(prisma: PrismaClient): Promise<void> {
  const customers = await seedCustomers(prisma);
  const supervisor = await prisma.staffUser.findUnique({
    where: { email: SUPERVISOR_EMAIL },
    select: { id: true },
  });

  const branches = await prisma.restaurantBranch.findMany({
    select: {
      id: true,
      name: true,
      avgPrepMin: true,
      restaurant: { select: { slug: true, reservationsEnabled: true } },
      menuItems: {
        where: { isAvailable: true },
        select: { id: true, nameI18n: true, priceAmd: true, prepMin: true },
        orderBy: { createdAt: 'asc' },
      },
      tables: { where: { isActive: true }, select: { id: true, seats: true }, orderBy: { tableNo: 'asc' } },
    },
    orderBy: [{ restaurantId: 'asc' }, { createdAt: 'asc' }],
  });

  const staffByBranch = await staffPerBranch(prisma, branches.map((branch) => branch.id));

  // One `now` for the whole run, so an order placed "twelve minutes ago" is
  // twelve minutes before the same instant on every branch.
  const now = Date.now();
  const seen = new Map<string, number>();

  const planned: { branchId: string; order: PlannedOrder }[] = [];
  for (const branch of branches) {
    // Two branches of one chain can share a name; the counter keeps their keys
    // apart without depending on ids that differ per database.
    const base = `${branch.restaurant.slug}/${branch.name ?? 'branch'}`;
    const nth = (seen.get(base) ?? 0) + 1;
    seen.set(base, nth);

    for (const order of planBranchOrders({
      key: `${base}#${nth}`,
      avgPrepMin: branch.avgPrepMin,
      menu: branch.menuItems.map((item) => ({
        id: item.id,
        nameI18n: item.nameI18n as I18nField,
        priceAmd: item.priceAmd,
        prepMin: item.prepMin,
      })),
      tables: branch.tables,
      reservationsEnabled: branch.restaurant.reservationsEnabled,
      customers,
      staffIds: staffByBranch.get(branch.id) ?? [],
      supervisorId: supervisor?.id ?? null,
      now,
    })) {
      planned.push({ branchId: branch.id, order });
    }
  }

  // Only what is missing. The code is the natural key, so a second run adds
  // nothing and a run interrupted halfway finishes the job.
  const existing = new Set(
    (
      await prisma.order.findMany({
        where: { code: { in: planned.map((row) => row.order.code) } },
        select: { code: true },
      })
    ).map((row) => row.code),
  );

  let written = 0;
  for (const { branchId, order } of planned) {
    if (existing.has(order.code)) {
      continue;
    }
    await writeOrder(prisma, branchId, order);
    written += 1;
  }

  const reconstructed = await reconstructHistory(prisma);

  console.log(
    `Orders seed: ${written} new across ${branches.length} branches ` +
      `(${planned.length - written} already there), ` +
      `${reconstructed} history entries reconstructed for older orders`,
  );
}

/**
 * One order, its lines, its payment, its booking and its whole history.
 *
 * In a transaction because they are one fact: an order without its history is
 * the exact hole `order_events` exists to close, and a dine-in order whose
 * booking failed to insert would be an order at nobody's table.
 */
async function writeOrder(
  prisma: PrismaClient,
  branchId: string,
  order: PlannedOrder,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const reservationId = order.reservation
      ? (
          await tx.reservation.create({
            data: {
              userId: order.userId,
              branchId,
              tableId: order.reservation.tableId,
              reservedFor: order.reservation.reservedFor,
              guests: order.reservation.guests,
              depositAmd: order.reservation.depositAmd,
              depositCredited: order.reservation.depositCredited,
              status: order.reservation.status,
              activeSlot: order.reservation.activeSlot,
              createdAt: order.createdAt,
            },
            select: { id: true },
          })
        ).id
      : null;

    await tx.order.create({
      data: {
        code: order.code,
        pickupCode: order.pickupCode,
        userId: order.userId,
        branchId,
        reservationId,
        serviceMode: order.serviceMode,
        status: order.status,
        subtotalAmd: order.subtotalAmd,
        serviceFeeAmd: order.serviceFeeAmd,
        depositAmd: order.depositAmd,
        discountAmd: order.discountAmd,
        totalAmd: order.totalAmd,
        readyAt: order.readyAt,
        notes: order.notes,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        items: { create: order.items },
        payment: order.payment ? { create: order.payment } : undefined,
        events: {
          create: order.events.map((event) => ({
            ...orderEventData(event),
            createdAt: event.at,
          })),
        },
      },
    });
  });
}

async function seedCustomers(prisma: PrismaClient): Promise<PlannedCustomer[]> {
  await prisma.user.createMany({
    skipDuplicates: true,
    data: CUSTOMERS.map((customer) => ({
      phone: customer.phone,
      phoneVerified: true,
      name: customer.name,
      language: customer.language,
    })),
  });

  const rows = await prisma.user.findMany({
    where: { phone: { in: CUSTOMERS.map((customer) => customer.phone) } },
    select: { id: true, language: true },
    orderBy: { phone: 'asc' },
  });

  return rows.map((row) => ({ id: row.id, language: row.language as Language }));
}

/** Who works where, active accounts only — a departed staff member should not
 *  be named as having advanced an order this morning. */
async function staffPerBranch(
  prisma: PrismaClient,
  branchIds: string[],
): Promise<Map<string, string[]>> {
  const assignments = await prisma.staffAssignment.findMany({
    where: { branchId: { in: branchIds }, staffUser: { isActive: true } },
    select: { branchId: true, staffUserId: true },
    orderBy: { createdAt: 'asc' },
  });

  const byBranch = new Map<string, string[]>();
  for (const assignment of assignments) {
    if (assignment.branchId === null) {
      continue;
    }
    const held = byBranch.get(assignment.branchId) ?? [];
    held.push(assignment.staffUserId);
    byBranch.set(assignment.branchId, held);
  }
  return byBranch;
}

/**
 * History for the orders that were already there.
 *
 * The migration gave every pre-existing order a `created` entry, which is all
 * its `created_at` could honestly support. What it could not give is the rest:
 * an order that is now `completed` has a timeline that stops at "placed", and a
 * dialog that says nothing about a finished order looks broken rather than
 * incomplete.
 *
 * So one entry is reconstructed from the row itself — its current status, at
 * `updated_at`, attributed to the system and flagged `reconstructed` so the
 * panel prints a note saying it was inferred. The status and the time come from
 * the database; the actor is genuinely unknown, and naming a plausible one
 * would turn an audit trail into fiction.
 *
 * Idempotent by shape rather than by a flag: an order whose history already
 * reaches its current status is skipped, which is every order the API itself
 * has ever moved.
 */
async function reconstructHistory(prisma: PrismaClient): Promise<number> {
  const orders = await prisma.order.findMany({
    select: {
      id: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      events: { select: { type: true, toStatus: true } },
    },
  });

  const entries: Prisma.OrderEventCreateManyInput[] = [];

  for (const order of orders) {
    // An order with no history at all predates even the backfill — inserted by
    // hand, most likely. It still got placed, and the row knows when.
    if (!order.events.some((event) => event.type === OrderEventType.Created)) {
      entries.push({
        orderId: order.id,
        type: OrderEventType.Created,
        toStatus: OrderStatus.Created,
        actorType: OrderActorType.System,
        detail: { reconstructed: true },
        createdAt: order.createdAt,
      });
    }

    const status = order.status as OrderStatus;
    if (status === OrderStatus.Created) {
      continue; // the entry above, or the backfilled one, already says this
    }
    if (order.events.some((event) => event.toStatus === status)) {
      continue; // its own history already accounts for where it is
    }

    entries.push({
      orderId: order.id,
      type: OrderEventType.StatusChanged,
      // No `fromStatus`: the row remembers where it is, not where it was, and
      // the panel renders "Moved to …" for exactly this case.
      toStatus: status,
      actorType: OrderActorType.System,
      detail: { reconstructed: true },
      createdAt: order.updatedAt,
    });
  }

  if (entries.length === 0) {
    return 0;
  }

  await prisma.orderEvent.createMany({ data: entries });
  return entries.length;
}
