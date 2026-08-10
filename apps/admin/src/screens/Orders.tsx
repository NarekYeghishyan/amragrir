import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ORDER_STATUS_FLOW,
  OrderActorType,
  OrderEventType,
  OrderStatus,
  PaymentStatus,
  PickupOption,
  QueueFilter,
  isInQueueFilter,
} from '@amragrir/shared';
import type { AdminTranslationKey } from '@amragrir/i18n/admin';
import {
  NO_ORDER_FILTERS,
  ORDERS_PAGE_SIZE,
  SEARCH_DEBOUNCE_MS,
  api,
  errorText,
  hasOrderFilters,
  type OrderFilters,
  type OrderHistoryEntry,
  type OrderReminder,
  type StaffBranch,
  type StaffOrder,
} from '../api';
import { useLanguage, useT } from '../i18n';
import type { Translate } from '../language';
import { routePath, type OrderScope } from '../navigation';
import { OrderHandoverDialog } from '../order-handover';
import { OrderQrDialog } from '../order-qr';
import { Link, navigate } from '../router';
import { watchOrders } from '../order-stream';
import { OrderReminderDialog, scheduleLine } from '../order-reminder';
import { formatAmd, formatCountdown, formatDateTime, formatWaiting } from '../format';
import { branchesOf, restaurantsOf, showsBranchFilter, soleBranchOf } from '../scope';
import {
  Badge,
  Banner,
  Button,
  ConfirmDialog,
  Dialog,
  DialogBody,
  EmptyState,
  Icon,
  IconButton,
  PageHeader,
  Pagination,
  SearchInput,
  SegmentedTabs,
  Select,
  Skeleton,
  Toolbar,
  Tooltip,
  useToast,
  type Tone,
} from '../ui';

/**
 * Statuses the panel may set, in the order a kitchen moves through them.
 *
 * Derived from the shared state machine rather than listed here: the buttons
 * shown for an order are exactly the moves the API would accept, so the panel
 * cannot offer one that 422s. `paid` is excluded because only a payment makes
 * an order paid.
 *
 * Usually one. `preparing` is the exception and gives two — *Almost ready*, and
 * *Ready* for a dish plated in one motion that never waits at the pass. The
 * first is the ordinary step and the one the card fills in; the rest are ways
 * past it, and read as offers rather than instructions.
 */
export function nextStatuses(status: OrderStatus): OrderStatus[] {
  return ORDER_STATUS_FLOW[status].filter((next) => next !== OrderStatus.Paid);
}

/** Colour follows how far along the order is, so the board reads as a gradient
 *  from "just in" to "waiting to be collected". */
function statusTone(status: OrderStatus): Tone {
  switch (status) {
    case OrderStatus.Ready:
    case OrderStatus.Completed:
      return 'good';
    case OrderStatus.Preparing:
    case OrderStatus.AlmostReady:
      return 'warn';
    case OrderStatus.Cancelled:
      return 'danger';
    default:
      return 'accent';
  }
}

function paymentTone(status: PaymentStatus | null): Tone {
  if (status === null) {
    return 'warn';
  }
  if (status === PaymentStatus.Captured || status === PaymentStatus.Authorized) {
    return 'good';
  }
  return status === PaymentStatus.Failed ? 'danger' : 'neutral';
}

/**
 * The stage tabs — one per status, in the order an order moves through them.
 *
 * The stages themselves live in `@amragrir/shared` because the **API** filters
 * by them; this is only their order on screen and the key each is labelled
 * with. `past` is last and reachable, which it never was: the board only ever
 * asked for active orders, so a completed or cancelled one could not be looked
 * at again from anywhere in the panel.
 *
 * **`paid` is where the board opens.** It is the only stage whose next move
 * belongs to the restaurant — the money is in and nobody has accepted the
 * order, so a diner is watching a timer that has not started. Everything after
 * it is either work under way or work already done, and neither is what a
 * kitchen opens this screen to find out.
 *
 * **`scheduled` sits before it**, because a pre-order is not yet anybody's work:
 * it is a booking, and it is on this tab precisely so it is *not* on the live
 * board pinned above the orders somebody is cooking. First in the strip and not
 * the landing tab, which is the difference between "here if you want it" and
 * "here is what to do next".
 *
 * **`active` is not offered.** It was the old default and it answered "show me
 * everything", which is not a question with an action attached: it mixed a paid
 * order nobody had accepted in with one sitting ready on the pass, so its count
 * was never a number anybody could act on. `QueueFilter.Active` still exists
 * and the API still defaults to it for a caller that names no stage — the panel
 * simply never asks for it.
 *
 * `unpaid` is deliberately **not** here — it is a filter inside `paid`, below.
 */
export const STAGE_TABS = [
  { value: QueueFilter.Scheduled, label: 'ordersStageScheduled' },
  { value: QueueFilter.Paid, label: 'ordersStagePaid' },
  { value: QueueFilter.Confirmed, label: 'ordersStageConfirmed' },
  { value: QueueFilter.Preparing, label: 'ordersStagePreparing' },
  { value: QueueFilter.AlmostReady, label: 'ordersStageAlmostReady' },
  { value: QueueFilter.Ready, label: 'ordersStageReady' },
  { value: QueueFilter.Past, label: 'ordersStagePast' },
] as const satisfies readonly { value: QueueFilter; label: AdminTranslationKey }[];

/**
 * The filter inside **Paid**, shown only while Paid is the open stage.
 *
 * The two halves of one question — did the money arrive. *Paid* is the queue
 * waiting to be accepted; *Unpaid* is an order placed and never paid for, an
 * abandoned basket or a card that was declined.
 *
 * Under `paid` rather than as a stage of its own, because the top strip is the
 * path an order takes through a kitchen and an unpaid order never enters it.
 * It hangs off the one stage it is the opposite of. Worth reaching at all
 * because **nothing expires those rows** — the API has no scheduled job — so
 * without a tab they pile up entirely out of sight.
 *
 * Both values are real `QueueFilter`s, so picking one is still just the stage
 * the API is asked for. There is no second filter in state and none in the
 * request.
 */
export const PAID_TABS = [
  { value: QueueFilter.Paid, label: 'ordersStagePaid' },
  { value: QueueFilter.Unpaid, label: 'ordersStageUnpaid' },
] as const satisfies readonly { value: QueueFilter; label: AdminTranslationKey }[];

/** The stage the top strip shows as open — `unpaid` is inside `paid`, not
 *  beside it, so it lights up Paid. */
export const topStage = (stage: QueueFilter): QueueFilter =>
  stage === QueueFilter.Unpaid ? QueueFilter.Paid : stage;

/**
 * Where an order sits in the queue: the moment the kitchen has to start it.
 *
 * `Infinity` when nothing recorded that — the rows written before pre-ordering
 * existed. They sort last rather than first, which is the API's rule too: an
 * order from before the feature is a finished one, and a finished order has no
 * claim on the front of a queue.
 */
export function startsAt(order: Pick<StaffOrder, 'prepStartAt'>): number {
  return order.prepStartAt === null
    ? Number.POSITIVE_INFINITY
    : new Date(order.prepStartAt).getTime();
}

/**
 * The address that holds the board on one order, and the one that lets the
 * queue back in — what the pin beside each code writes.
 *
 * The scope is carried through unchanged. Pinning narrows what is already on
 * screen; it is not a move to another branch's board, and a pin that quietly
 * widened the restaurant picker would answer a question nobody asked.
 *
 * Its own function, and exported, because it is the whole of what the pin does:
 * the board around it needs a document and a run of effects before it will say
 * anything, and this is testable without either.
 */
export function pinScope(filters: OrderFilters, code: string | null): OrderScope {
  return {
    restaurantId: filters.restaurantId || null,
    branchId: filters.branchId || null,
    orderCode: code,
  };
}

/**
 * The "no restaurant / no branch chosen" option, as a value.
 *
 * Not `''`: Radix rejects an empty string as an item value, reserving it for
 * the placeholder state — which is unreachable once something is picked. A
 * filter you can set and not unset is a trap, so "All" is a real option in the
 * list, and this is what it carries.
 */
const ANY = '*';

/**
 * The order board.
 *
 * `branches` is what the restaurant and branch pickers are built from — it
 * arrives from the shell, which already fetches it. Passed rather than fetched
 * here so the board paints its first frame without waiting on a second request:
 * a kitchen screen that is blank until two calls return is a kitchen screen
 * somebody stops trusting.
 *
 * `scope` is where those two pickers are pointed, and it comes from the address
 * rather than from state here — which is what makes a branch's queue something
 * a colleague can be sent to, and what the "Orders" button on each branch of
 * the Restaurants screen links to. The stage tabs and the search box stay in
 * state below: they narrow the answer rather than being one.
 */
export function Orders({
  branches,
  scope = null,
  links = { staff: false, customers: false },
  canOpenMenu = false,
}: {
  branches: StaffBranch[];
  scope?: OrderScope | null;
  /** Which lists of people this account can open, which is what decides whether
   *  a name in an order's history is a link — see `actorHref`. Defaults to
   *  neither, so a caller that says nothing offers no dead ends. */
  links?: PeopleLinks;
  /** Whether a line of an order is a link to the dish it was ordered from.
   *  Gated on `menu:read`, which is what opens the Menu screen — a shift
   *  account watching the board may not hold it, and a link to a tab the
   *  sidebar does not show is a dead end. Defaults to false for the same
   *  reason `links` defaults to neither. */
  canOpenMenu?: boolean;
}) {
  const t = useT();
  const [orders, setOrders] = useState<StaffOrder[] | null>(null);
  const [counts, setCounts] = useState<Record<QueueFilter, number> | null>(null);
  // Which search the counts on the tabs were taken under. The counts outlive the
  // request that changed the search — they stay on screen while the next page
  // loads, which is what keeps the tabs from flickering — so anything reasoning
  // about *what* they count has to know that, and the stage-landing effect below
  // does.
  const [countsFor, setCountsFor] = useState('');
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // The scope as plain strings — the shape the filters and the pickers already
  // speak, and the shape an effect can depend on. The object itself is rebuilt
  // from the URL on every render of the shell, so depending on *it* would be
  // depending on a new identity each time.
  const scopedRestaurantId = scope?.restaurantId ?? '';
  const scopedBranchId = scope?.branchId ?? '';
  // One order, when the address names one — what a line in somebody's activity
  // links to. It reaches the API as the search term, because searching by code
  // is what the board already does; what the address adds is that the board
  // then goes and finds which stage the order is sitting in (see below).
  const scopedOrderCode = scope?.orderCode ?? '';

  // What the board is showing, and what the typing hand is up to. Separate,
  // because the search is debounced: `query` changes per keystroke, `filters`
  // only when it settles, and only `filters` reaches the API.
  //
  // Seeded from the address rather than adopted by the effect below, so a board
  // opened on a branch fetches that branch once instead of fetching everything
  // and then correcting itself a frame later.
  const [filters, setFilters] = useState<OrderFilters>(() => ({
    ...NO_ORDER_FILTERS,
    restaurantId: scopedRestaurantId,
    branchId: scopedBranchId,
    q: scopedOrderCode,
  }));
  const [query, setQuery] = useState(scopedOrderCode);
  const [page, setPage] = useState(1);

  // The address changing under a board that is already up: the back button, a
  // second link followed from the same tab, or one of the pickers below, which
  // narrow by navigating. All of them arrive here, so there is one path from
  // "what the URL says" to "what the board fetches" rather than two that can
  // disagree.
  useEffect(() => {
    setFilters((current) =>
      current.restaurantId === scopedRestaurantId &&
      current.branchId === scopedBranchId &&
      (scopedOrderCode === '' || current.q === scopedOrderCode)
        ? current
        : {
            ...current,
            restaurantId: scopedRestaurantId,
            branchId: scopedBranchId,
            // Only ever set, never cleared: an address that names no order is
            // the ordinary board, not an instruction to empty a search box
            // somebody is typing in. What clears it is `clear()` below.
            ...(scopedOrderCode === '' ? {} : { q: scopedOrderCode }),
          },
    );
    if (scopedOrderCode !== '') {
      setQuery(scopedOrderCode);
    }
    setPage(1);
  }, [scopedRestaurantId, scopedBranchId, scopedOrderCode]);

  // A board sent to one order lands on the stage that holds it.
  //
  // The counts come back with every page and are taken under the search but
  // *not* under the stage, so with a code in the box they say exactly where the
  // order is. Typing one is meant to leave you where you are and let the tabs
  // say "Active 0 · Past 1" — that is the board telling you where to look. A
  // link is different: it was sent to land on the order, and landing on an
  // empty Active tab is landing next to it.
  //
  // Active is checked first and matches New, Preparing and Ready as well, so a
  // live order stays on the live board rather than being filed under a stage.
  // Nothing to switch to means the order is finished, out of reach, or gone —
  // and the empty state says so better than a guess would.
  //
  // `countsFor` is what makes this safe to run on arrival: following a link from
  // a board that is already up means holding counts for the *previous* search
  // for one request, and moving to a stage chosen from those would be moving to
  // the wrong one and then correcting it in front of somebody.
  useEffect(() => {
    if (
      scopedOrderCode === '' ||
      counts === null ||
      countsFor !== scopedOrderCode ||
      counts[filters.stage] > 0
    ) {
      return;
    }
    const holding = STAGE_TABS.find((tab) => (counts[tab.value] ?? 0) > 0);
    if (holding !== undefined) {
      setFilters((current) => ({ ...current, stage: holding.value }));
      setPage(1);
    }
  }, [scopedOrderCode, counts, countsFor, filters.stage]);

  const stream = useRef<ReturnType<typeof watchOrders> | null>(null);
  const toast = useToast();

  const load = useCallback(
    async (applied: OrderFilters, wanted: number) => {
      try {
        const result = await api.orders(applied, wanted);
        setOrders(result.items);
        setCounts(result.counts);
        setCountsFor(applied.q);
        setTotal(result.total);
        setError(null);
      } catch (err) {
        setOrders((current) => current ?? []);
        setError(errorText(t, err, 'errorLoadOrders'));
      }
    },
    [t],
  );

  // The search settles before it is applied. Every keystroke reaching the API
  // would be a request per character on a screen that is already polling.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const term = query.trim();
      setFilters((current) => (current.q === term ? current : { ...current, q: term }));
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    void load(filters, page);
  }, [load, filters, page]);

  // The socket needs the current stage but must not be rebuilt when it changes:
  // reopening a live board's connection to change a filter is a gap in it.
  const stageRef = useRef(filters.stage);
  useEffect(() => {
    stageRef.current = filters.stage;
  }, [filters.stage]);

  // One socket for the whole board, opened once and kept.
  useEffect(() => {
    stream.current = watchOrders(
      [],
      (update) =>
        setOrders((current) =>
          (current ?? [])
            .map((order) =>
              order.id === update.orderId
                ? { ...order, status: update.status, secondsLeft: update.secondsLeft }
                : order,
            )
            // An order whose new status is outside the stage being viewed
            // leaves the board — on the live board that is anything finished,
            // and under "Done" it is the reverse.
            .filter((order) => isInQueueFilter(order.status, stageRef.current)),
        ),
      setLive,
    );
    return () => stream.current?.close();
  }, []);

  // New orders still arrive by polling — the stream carries changes to orders
  // it already knows about, not creations. It also refreshes the counts, which
  // no broadcast covers.
  useEffect(() => {
    const poll = window.setInterval(() => void load(filters, page), 20_000);
    return () => window.clearInterval(poll);
  }, [load, filters, page]);

  useEffect(() => {
    stream.current?.setOrders((orders ?? []).map((order) => order.id));
  }, [orders]);

  /**
   * The numbers on the stage tabs, re-read after an order has moved.
   *
   * The card itself needs no help — it leaves the board on the broadcast the
   * move triggers, and that is still the only thing the list is set from. But
   * **no broadcast carries the counts.** They are computed per request, across
   * every stage and under the whole search, and a socket frame about one order
   * cannot say what the other tabs now hold. So the strip kept whatever it was
   * last fetched with until the next poll — up to twenty seconds of Paid
   * reading "3" over two cards, immediately after somebody watched the third
   * one go. The one part of this screen that is a running total was the one
   * part that stood still.
   *
   * A re-read rather than arithmetic here, for the same reason the tabs show
   * the API's numbers at all: a stage is not always a set of statuses
   * (`scheduled` is a question about a timestamp), and a pre-order is counted
   * in that stage and in *none* of the others — so adding one here and taking
   * one away there would drift from the server exactly where the rules are
   * least obvious, and the symptom would be a tab whose count disagrees with
   * the list under it.
   */
  const recount = (): void => void load(filters, page);

  const advance = async (order: StaffOrder, status: OrderStatus): Promise<void> => {
    setBusyId(order.id);
    try {
      await api.setOrderStatus(order.id, status);
      // The board updates from the broadcast this triggers, so nothing is set
      // optimistically here — what is shown is what the server recorded.
      toast.success(
        t('orderAdvanced', { code: order.code, status: t(`orderStatus_${status}`) }),
      );
    } catch (err) {
      toast.error(errorText(t, err, 'errorUpdateOrder'));
    } finally {
      setBusyId(null);
      // Both outcomes, and for different reasons: a move that went through
      // changed what every tab holds, and one that was refused may have been
      // refused because the order had already moved under somebody else's
      // hand — in which case the counts on screen are the stale ones that
      // made the press look reasonable.
      recount();
    }
  };

  /**
   * An order that has just been collected.
   *
   * The dialog made the call — it has to, because it is the thing that shows
   * the refusal — so this is only the announcement. The board itself updates
   * from the same broadcast every other move rides on, and the tabs above it
   * are re-read the same way every other move re-reads them: a handover is
   * `ready → completed`, so Ready and Past both change on it.
   */
  const handedOver = (order: StaffOrder): void => {
    toast.success(
      t('orderAdvanced', {
        code: order.code,
        status: t(`orderStatus_${OrderStatus.Completed}`),
      }),
    );
    recount();
  };

  /**
   * One card, after its warning has been moved.
   *
   * Patched rather than refetched: the board is live, and re-reading fifty
   * orders to record that one number changed would let a response that left
   * before a socket update landed overwrite the status it delivered.
   *
   * A card leaves the board when its answer no longer matches the tab. Both
   * directions are real — a notice long enough to fire immediately takes a
   * pre-order off Scheduled and onto the live board, and one lengthened past the
   * clock takes it back — and the rule is the same either way, so neither is a
   * case handled on its own.
   */
  const applyReminder = (reminder: OrderReminder): void => {
    setOrders((current) =>
      (current ?? [])
        .map((order) =>
          order.id === reminder.id
            ? {
                ...order,
                reminderAt: reminder.reminderAt,
                reminderLeadMin: reminder.reminderLeadMin,
                scheduled: reminder.scheduled,
              }
            : order,
        )
        .filter(
          (order) =>
            order.id !== reminder.id ||
            order.scheduled === (stageRef.current === QueueFilter.Scheduled),
        ),
    );
  };

  const narrow = (change: Partial<OrderFilters>): void => {
    setFilters((current) => ({ ...current, ...change }));
    // Any change to what is being looked at makes the current page number a
    // statement about a different list.
    setPage(1);
  };

  /**
   * Point the board at a restaurant and a branch.
   *
   * A navigation rather than a `setFilters`, because the scope *is* the
   * address: whoever narrows the board and then copies the URL out of the bar
   * should be sending the queue they are looking at, not the one they arrived
   * on. `replace`, so the back button leaves for wherever they came from
   * instead of walking back through every picker they touched on the way.
   *
   * A named order is dropped on the way, because moving the pickers is moving
   * to another queue and that order is not in it. The code stays in the search
   * box — a search box keeps what is in it until it is cleared, here as
   * everywhere else — but the address stops claiming the board is about it.
   */
  const scopeTo = (restaurantId: string, branchId: string): void => {
    navigate(
      routePath({
        tab: 'Orders',
        scope: {
          restaurantId: restaurantId || null,
          branchId: branchId || null,
          orderCode: null,
        },
      }),
      { replace: true },
    );
  };

  /**
   * Hold the board on one order, or let the queue back in.
   *
   * The code goes where a link from somebody's activity already puts it —
   * `&order=` — rather than straight into the search box, because the two are
   * the same act: naming one order. The box fills from the address (the effect
   * above), so the term is visible and editable exactly as a typed one is, and
   * a pinned board has a URL that can be sent to whoever is asking about that
   * order.
   *
   * `replace`, like the pickers: narrowing a queue is not a place in the
   * browser's history. Nothing is lost by that — on a pinned board the one card
   * on screen is the one carrying the pin that undoes it.
   *
   * Unpinning empties the box itself, because the address effect only ever
   * *sets* the search from `&order=` and never clears it: an address that names
   * no order is the ordinary board rather than an instruction to empty a box
   * somebody is typing in. Taking the pin out is that instruction.
   */
  const pin = (code: string | null): void => {
    navigate(routePath({ tab: 'Orders', scope: pinScope(filters, code) }), { replace: true });
    if (code === null) {
      setQuery('');
      setFilters((current) => (current.q === '' ? current : { ...current, q: '' }));
      setPage(1);
    }
  };

  const clear = (): void => {
    setQuery('');
    // Keeps the stage: clearing a search means "show me this stage again", not
    // "take me back to the live board".
    setFilters((current) => ({ ...NO_ORDER_FILTERS, stage: current.stage }));
    setPage(1);
    // And the scope with it — it lives in the address, so clearing it is a
    // navigation like setting it was.
    scopeTo('', '');
  };

  // One entry per restaurant the account can reach. Derived from the branches
  // rather than fetched: the shell already has them, and a restaurant with no
  // branches has no orders to filter to.
  const restaurants = useMemo(() => restaurantsOf(branches), [branches]);
  const branchOptions = useMemo(
    () => branchesOf(branches, filters.restaurantId),
    [branches, filters.restaurantId],
  );

  // By when the kitchen has to start, soonest first: a queue is worked in the
  // order it comes up, and the card that needs attention next should not be the
  // one that scrolled off. The API sorts the same way; this keeps it true after
  // a socket update reorders nothing but could.
  //
  // It used to sort on `createdAt`, which is the same ordering for an order
  // wanted as soon as possible — `prepStartAt` is that time plus a prep
  // estimate — and the wrong one for a pre-order, whose place in the queue is
  // the hour it must be started and not the day it was placed. `createdAt` is
  // the tie-break, and stands in for orders written before the column existed.
  const shown = useMemo(
    () =>
      [...(orders ?? [])].sort(
        (a, b) =>
          startsAt(a) - startsAt(b) ||
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    [orders],
  );

  const filtered = hasOrderFilters(filters);

  // The list itself, as the panel of whichever strip ends up around it — the
  // stage tabs, or the New filter nested inside them. One definition rather
  // than two branches rendering the same board, which is how the two would come
  // to disagree.
  const board =
    shown.length === 0 ? (
      <EmptyState
        icon="clock"
        title={
          filtered
            ? t('ordersEmptyFilteredTitle')
            : filters.stage === QueueFilter.Paid
              ? t('ordersEmptyPaidTitle')
              : filters.stage === QueueFilter.Scheduled
                ? t('ordersEmptyScheduledTitle')
                : t('ordersEmptyStageTitle')
        }
        description={
          filtered
            ? t('ordersEmptyFilteredDesc')
            : filters.stage === QueueFilter.Paid
              ? t('ordersEmptyPaidDesc')
              : filters.stage === QueueFilter.Scheduled
                ? t('ordersEmptyScheduledDesc')
                : t('ordersEmptyStageDesc')
        }
        action={
          filtered && (
            <Button icon="close" onClick={clear}>
              {t('ordersFiltersClear')}
            </Button>
          )
        }
      />
    ) : (
      <>
        <div className="board">
          {shown.map((order) => (
            <OrderCard
              key={order.id}
              t={t}
              order={order}
              busy={busyId === order.id}
              // The address, not the search box: somebody who typed the code by
              // hand is looking for an order, and the pin says the board is
              // being *held* on one. Only the pin sets that, so only the pin
              // lights up.
              pinned={order.code === scopedOrderCode}
              links={links}
              canOpenMenu={canOpenMenu}
              onPin={() => pin(order.code === scopedOrderCode ? null : order.code)}
              onAdvance={(status) => void advance(order, status)}
              onHandedOver={() => handedOver(order)}
              onSetReminder={applyReminder}
            />
          ))}
        </div>

        <Pagination
          page={page}
          pageSize={ORDERS_PAGE_SIZE}
          total={total}
          onPage={setPage}
          labels={{
            nav: t('pagerLabel'),
            previous: t('pagerPrevious'),
            next: t('pagerNext'),
            page: (n) => t('pagerPage', { page: n }),
            range: t('pagerRange', {
              from: (page - 1) * ORDERS_PAGE_SIZE + 1,
              to: Math.min(page * ORDERS_PAGE_SIZE, total),
              total,
            }),
          }}
        />
      </>
    );

  return (
    <section>
      <PageHeader
        title={t('ordersTitle')}
        description={t('ordersDesc')}
        actions={
          <Tooltip label={live ? t('ordersLiveTip') : t('ordersOfflineTip')}>
            <span>
              <Badge tone={live ? 'good' : 'neutral'} dot>
                {live ? t('ordersLive') : t('ordersReconnecting')}
              </Badge>
            </span>
          </Tooltip>
        }
      />

      {error !== null && <Banner>{error}</Banner>}

      {/* Scope, above the stage tabs. The two are different questions — "which
          orders am I looking at" and "how far along are they" — and the counts
          on the tabs are taken under whatever is set here, so a search shows
          you which stage the order you are after is actually sitting in. */}
      <Toolbar>
        <SearchInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('ordersSearch')}
          aria-label={t('ordersSearchHint')}
        />

        {/* Only when there is a choice to make. Most kitchens are one branch of
            one restaurant, and two selects reading "All" is furniture. */}
        {restaurants.length > 1 && (
          <Select
            value={filters.restaurantId || ANY}
            onValueChange={(value) => {
              const restaurantId = value === ANY ? '' : value;
              // Changing restaurant drops the branch: the old one belongs to
              // the old restaurant, and the two together would match nothing.
              // Unless the new one has a single branch, which is then selected
              // outright — asking "which branch" when there is one answer is
              // asking somebody to confirm a decision already made for them.
              scopeTo(restaurantId, soleBranchOf(branches, restaurantId));
            }}
            ariaLabel={t('ordersRestaurantAll')}
            options={[
              { value: ANY, label: t('ordersRestaurantAll') },
              ...restaurants.map(([id, name]) => ({ value: id, label: name })),
            ]}
          />
        )}

        {showsBranchFilter(filters.restaurantId, branchOptions.length) && (
          <Select
            value={filters.branchId || ANY}
            onValueChange={(value) =>
              scopeTo(filters.restaurantId, value === ANY ? '' : value)
            }
            ariaLabel={t('ordersBranchAll')}
            options={[
              { value: ANY, label: t('ordersBranchAll') },
              ...branchOptions.map((branch) => ({
                value: branch.id,
                label: branch.name ?? branch.city,
                // Only while the list spans restaurants. Two branches called
                // "Northern Ave" need telling apart then; once one restaurant
                // is chosen the hint repeats the control above it.
                hint: filters.restaurantId === '' ? branch.restaurantName : undefined,
              })),
            ]}
          />
        )}

        {filtered && (
          <Button icon="close" onClick={clear}>
            {t('ordersFiltersClear')}
          </Button>
        )}
      </Toolbar>

      {orders === null ? (
        <Skeleton count={3} height={220} />
      ) : (
        <SegmentedTabs
          value={topStage(filters.stage)}
          onValueChange={(stage) => narrow({ stage })}
          label={t('ordersFilterLabel')}
          segments={STAGE_TABS.map((tab) => ({
            value: tab.value,
            label: t(tab.label),
            // Counted by the API under the same search and scope, so a tab
            // saying "3" means three, not three among the page it fetched.
            count: counts?.[tab.value],
          }))}
        >
          {topStage(filters.stage) === QueueFilter.Paid ? (
            <div className="subfilter">
              <SegmentedTabs
                value={filters.stage}
                onValueChange={(stage) => narrow({ stage })}
                label={t('ordersPaidFilterLabel')}
                segments={PAID_TABS.map((tab) => ({
                  value: tab.value,
                  label: t(tab.label),
                  count: counts?.[tab.value],
                }))}
              >
                {board}
              </SegmentedTabs>
            </div>
          ) : (
            board
          )}
        </SegmentedTabs>
      )}
    </section>
  );
}

/**
 * What one history entry says happened.
 *
 * Built from the entry's own fields rather than from a sentence the API sends,
 * for the reason every other string in this panel is: the API answers in the
 * language of the request, but a status name has to match the badge next to it
 * and the tab above it, and those are translated here.
 */
export function headline(t: Translate, entry: OrderHistoryEntry): string {
  switch (entry.type) {
    case OrderEventType.Created:
      return t('historyPlaced');
    case OrderEventType.Payment:
      return entry.detail?.paymentStatus === undefined
        ? t('historyPaymentAttempt')
        : t('historyPaymentOutcome', {
            status: t(`paymentStatus_${entry.detail.paymentStatus}`),
          });
    case OrderEventType.StatusChanged:
      return entry.toStatus === null
        ? t('historyMoved')
        : t('historyMovedTo', { status: t(`orderStatus_${entry.toStatus}`) });
    case OrderEventType.ReminderSet:
      // Named for what moved rather than for the column: nobody at a pass
      // thinks in `reminder_lead_min`, and the number itself is on the second
      // line — see `detailLine`.
      return t('historyReminderSet');
  }
}

/**
 * A sentence with somebody's name in it, cut into the three pieces around it.
 *
 * So the name alone can be a link while the words either side stay words. The
 * alternative is a translated string with markup in it, which puts a decision
 * about HTML inside a dictionary that translators edit.
 *
 * `name` is null when the sentence names nobody — "The system", or an account
 * since deleted — and there is then nothing to link and nothing to link to.
 */
export interface NamedSentence {
  before: string;
  name: string | null;
  after: string;
}

/** The placeholder every one of these dictionary entries uses for the person. */
const NAME_SLOT = '{name}';

/**
 * One dictionary entry, split around its `{name}`.
 *
 * The raw template is what `t(key)` returns when it is given no parameters —
 * interpolation is what fills the slot, so not asking for it leaves the slot
 * visible and findable. An entry that has lost its placeholder in translation
 * still renders the whole sentence with the name in it, unlinked: a missing
 * link is a smaller failure than a missing person.
 */
function splitOnName(t: Translate, key: AdminTranslationKey, name: string): NamedSentence {
  const template = t(key);
  const at = template.indexOf(NAME_SLOT);
  if (at === -1) {
    return { before: t(key, { name }), name: null, after: '' };
  }
  return { before: template.slice(0, at), name, after: template.slice(at + NAME_SLOT.length) };
}

/**
 * Who did it.
 *
 * A missing name is said out loud rather than left blank: the actor columns are
 * `ON DELETE SET NULL`, so "somebody whose account is gone" is a real answer,
 * and an empty line would read as a rendering bug instead.
 */
export function actorSentence(t: Translate, actor: OrderHistoryEntry['actor']): NamedSentence {
  const plain = (key: AdminTranslationKey): NamedSentence => ({
    before: t(key),
    name: null,
    after: '',
  });
  const named = (key: AdminTranslationKey, unnamed: AdminTranslationKey): NamedSentence =>
    actor.name === null ? plain(unnamed) : splitOnName(t, key, actor.name);

  switch (actor.type) {
    case OrderActorType.Customer:
      return named('historyByCustomer', 'historyByCustomerUnnamed');
    case OrderActorType.Staff:
      return named('historyByStaff', 'historyByStaffGone');
    case OrderActorType.System:
      return plain('historyBySystem');
  }
}

/** The same sentence as one string, for the callers that have nowhere to put a
 *  link — and so that the linked and unlinked forms cannot come to disagree
 *  about what the line says. */
export function actorLine(t: Translate, actor: OrderHistoryEntry['actor']): string {
  const parts = actorSentence(t, actor);
  return parts.before + (parts.name ?? '') + parts.after;
}

/** Which lists of people this account can open. Two booleans rather than the
 *  permission set, matching how the other screens are told what they may offer
 *  — and the API decides regardless of what the panel renders. */
export interface PeopleLinks {
  staff: boolean;
  customers: boolean;
}

/**
 * Where a name in the timeline leads, or null when it leads nowhere.
 *
 * Null in three different situations, all of which end the same way — the name
 * renders as text: nobody is named, nothing recorded which person it was, or
 * this account cannot open the screen that person is on. A shift running the
 * kitchen display holds `orders:read` and neither of the other two, so for them
 * the dialog reads exactly as it did before.
 */
export function actorHref(
  actor: OrderHistoryEntry['actor'],
  links: PeopleLinks,
): string | null {
  if (actor.name === null || actor.id === null) {
    return null;
  }
  switch (actor.type) {
    case OrderActorType.Customer:
      return links.customers ? routePath({ tab: 'Customers', person: actor.id }) : null;
    case OrderActorType.Staff:
      return links.staff ? routePath({ tab: 'People', person: actor.id }) : null;
    case OrderActorType.System:
      return null;
  }
}

/**
 * Where the *impersonator* leads — the super admin who was really at the
 * keyboard, rather than the account they were acting as.
 *
 * Always a staff link, whatever the actor beside it is: only staff can be
 * impersonated, and only staff can do the impersonating.
 */
export function impersonatorHref(
  actor: OrderHistoryEntry['actor'],
  links: PeopleLinks,
): string | null {
  return actor.impersonatedBy === null || actor.impersonatedById === null || !links.staff
    ? null
    : routePath({ tab: 'People', person: actor.impersonatedById });
}

/**
 * A sentence about somebody, with the somebody linked when there is somewhere
 * to send them.
 *
 * The link is only ever the name. The words around it — "· customer", ", acting
 * as this account" — are about the entry rather than about the person, and
 * underlining them would offer to navigate from half a sentence.
 */
function Who({
  sentence,
  to,
  label,
}: {
  sentence: NamedSentence;
  to: string | null;
  /** What the link is for, on hover. Only the tooltip: the link's accessible
   *  name stays the person's name, which is what a screen reader should read
   *  out and what a list of links on the page should be a list of. */
  label: string;
}) {
  return (
    <>
      {sentence.before}
      {sentence.name !== null &&
        (to === null ? (
          sentence.name
        ) : (
          <Link to={to} className="timeline__who-link" title={label}>
            {sentence.name}
          </Link>
        ))}
      {sentence.after}
    </>
  );
}

/** The extras worth a second line, and nothing when there are none. */
export function detailLine(t: Translate, entry: OrderHistoryEntry): string | null {
  const detail = entry.detail;
  if (detail === undefined || detail === null) {
    return null;
  }

  const parts: string[] = [];
  // The two numbers around a moved warning, and both of them: "somebody set it
  // to 45" does not answer "why did this go out so early". The previous value is
  // null on a pre-order placed before the lead was a column of its own.
  if (detail.reminderLeadMin !== undefined) {
    parts.push(
      detail.previousReminderLeadMin === undefined || detail.previousReminderLeadMin === null
        ? t('historyReminderLead', { minutes: detail.reminderLeadMin })
        : t('historyReminderMoved', {
            from: detail.previousReminderLeadMin,
            to: detail.reminderLeadMin,
          }),
    );
  }
  if (detail.itemsCount !== undefined) {
    parts.push(t.plural('dishCount', detail.itemsCount));
  }
  if (detail.paymentMethod !== undefined) {
    parts.push(t(`paymentMethod_${detail.paymentMethod}`));
  }
  if (detail.amountAmd !== undefined) {
    parts.push(formatAmd(detail.amountAmd));
  } else if (detail.totalAmd !== undefined) {
    parts.push(formatAmd(detail.totalAmd));
  }

  return parts.length === 0 ? null : parts.join(' · ');
}

/**
 * The caveat an entry carries, if it carries one.
 *
 * Two entries in a timeline can look identical and mean different things: one
 * was written as it happened, the other worked out afterwards from the order
 * row. Saying which is which is the difference between a record and a story —
 * so the note is rendered, not left to whoever is reading to guess.
 */
export function noteLine(t: Translate, entry: OrderHistoryEntry): string | null {
  if (entry.detail?.backfilled === true) {
    return t('historyBackfilled');
  }
  if (entry.detail?.reconstructed === true) {
    return t('historyReconstructed');
  }
  return null;
}

/**
 * Everything that has happened to one order.
 *
 * Fetched when the dialog opens, and again on every open: an order moves while
 * the panel is looking elsewhere, and a timeline held from the last time it was
 * read is a timeline that is wrong exactly when somebody is checking.
 */
function OrderHistoryDialog({
  t,
  order,
  links,
}: {
  t: Translate;
  order: StaffOrder;
  links: PeopleLinks;
}) {
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<OrderHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    let live = true;
    setEntries(null);
    setError(null);

    api
      .orderHistory(order.id)
      .then((result) => {
        if (live) {
          setEntries(result.items);
        }
      })
      .catch((err: unknown) => {
        if (live) {
          setError(errorText(t, err, 'errorLoadHistory'));
        }
      });

    // Closing mid-request must not land its answer in a dialog that is no
    // longer open — or, worse, in the next order's.
    return () => {
      live = false;
    };
  }, [open, order.id, t]);

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={t('historyTitle', { code: order.code })}
      description={t('historyDesc')}
      trigger={<Button icon="history">{t('historyAction')}</Button>}
    >
      <DialogBody>
        {error !== null ? (
          <Banner>{error}</Banner>
        ) : entries === null ? (
          <Skeleton count={3} height={52} />
        ) : entries.length === 0 ? (
          <EmptyState
            icon="history"
            title={t('historyEmptyTitle')}
            description={t('historyEmptyDesc')}
          />
        ) : (
          <ol className="timeline">
            {entries.map((entry) => {
              const detail = detailLine(t, entry);
              const note = noteLine(t, entry);
              return (
                <li key={entry.id} className="timeline__entry">
                  {/* Decorative: the running order is already carried by the
                      list, and reading "bullet" before every entry is noise. */}
                  <span className="timeline__mark" aria-hidden="true" />
                  <div className="timeline__body">
                    <div className="row spread">
                      <span className="timeline__what">{headline(t, entry)}</span>
                      <time className="timeline__at" dateTime={entry.at}>
                        {formatDateTime(entry.at, language)}
                      </time>
                    </div>
                    <p className="timeline__who">
                      <Who
                        sentence={actorSentence(t, entry.actor)}
                        to={actorHref(entry.actor, links)}
                        label={
                          entry.actor.type === OrderActorType.Customer
                            ? t('historyOpenCustomer')
                            : t('historyOpenStaff')
                        }
                      />
                      {entry.actor.impersonatedBy !== null && (
                        <>
                          {' · '}
                          <Who
                            sentence={splitOnName(
                              t,
                              'historyImpersonatedBy',
                              entry.actor.impersonatedBy,
                            )}
                            to={impersonatorHref(entry.actor, links)}
                            label={t('historyOpenStaff')}
                          />
                        </>
                      )}
                    </p>
                    {detail !== null && <p className="timeline__detail">{detail}</p>}
                    {note !== null && <p className="timeline__note">{note}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </DialogBody>
    </Dialog>
  );
}

function OrderCard({
  t,
  order,
  busy,
  pinned,
  links,
  canOpenMenu,
  onPin,
  onAdvance,
  onHandedOver,
  onSetReminder,
}: {
  t: Translate;
  order: StaffOrder;
  busy: boolean;
  /** Whether the board is currently being held on this order — see `pin` in
   *  `Orders`, which is the only thing that sets it. */
  pinned: boolean;
  links: PeopleLinks;
  /** Whether each line is a link to its dish on the menu — see `Orders`. */
  canOpenMenu: boolean;
  /** Hold the board on this order, or — when it already is — let the queue back
   *  in. One handler for both, because it is one control. */
  onPin: () => void;
  onAdvance: (status: OrderStatus) => void;
  /** The handover, which the dialog has already performed — this only says so.
   *  Separate from `onAdvance` because the dialog owns the request: it needs the
   *  refusal back, to say "that code is not this order's" beside the box. */
  onHandedOver: () => void;
  onSetReminder: (reminder: OrderReminder) => void;
}) {
  const { language } = useLanguage();
  // Which button was pressed, so only that one spins. `busy` alone would put a
  // spinner on every action the card offers.
  const [pending, setPending] = useState<OrderStatus | null>(null);
  useEffect(() => {
    if (!busy) {
      setPending(null);
    }
  }, [busy]);

  const go = (status: OrderStatus): void => {
    setPending(status);
    onAdvance(status);
  };

  const countdown = formatCountdown(order.secondsLeft);
  // Past its promised time. Marked on the card itself rather than sorted to the
  // top, because a queue that reorders itself under someone's hand is worse
  // than one they have to scan.
  //
  // Never on a pre-order whose hour has not come: `secondsLeft` counts to the
  // moment the food is due, and on an order placed for next Tuesday it is
  // negative from the second it is paid for. Warning a kitchen that it is late
  // for work it was not meant to have started is how a warning stops meaning
  // anything.
  const late = !order.scheduled && order.secondsLeft !== null && order.secondsLeft <= 0;
  const schedule = scheduleLine(t, order, language);

  return (
    <article className={late ? 'order order--late' : 'order'}>
      <div className="row spread">
        {/* The order's name, which is what a card has to be identifiable by.
            It used to be the pickup code — four digits, big, at the top —
            and that is exactly what made "confirm at handover" theatre: a
            counter reading the code off its own board never had to ask the
            guest for anything. The code is not on this screen at all now, and
            the API does not send it. */}
        <span className="order__title">
          {/* The pin, before the code and about it: it puts that code in the
              search box and leaves the one order on the board. What a counter
              does while somebody is on the phone about an order — read it out,
              check what is in it, say when it will be ready — is done over a
              board of fifty cards that reorders itself every twenty seconds,
              and the alternative was retyping twelve characters somebody is
              reading off the screen they are trying not to lose.

              Its own name says which order, because a board is a list of these
              and "Pin" fifty times over is a list of buttons rather than a list
              of orders. Pressed again it lets the queue back in — and the
              pinned board is one card, so the way out is the thing that is in
              front of whoever pinned it. */}
          <IconButton
            icon="pin"
            label={pinned ? t('orderUnpin') : t('orderPin', { code: order.code })}
            title={pinned ? t('orderUnpin') : t('orderPin', { code: order.code })}
            className={pinned ? 'order__pin order__pin--on' : 'order__pin'}
            onClick={onPin}
          />
          <span className="order__code num">{order.code}</span>
        </span>
        <span className="row row--tight">
          {/* Only the ending that changes what the pass does.

              Every pickup order is taken away unless somebody said otherwise,
              so a "take away" badge on nine cards out of ten would be a label
              nobody reads — and the tenth one, the one that needs a plate
              rather than a bag, would be lost among them. This is the
              exception, and it is marked as one. */}
          {order.pickupOption === PickupOption.EatIn && (
            <Badge tone="accent">{t('orderEatsIn')}</Badge>
          )}
          {/* A table, an hour and a party — the three things a pass needs about
              a dine-in order and the three it was never told. Drawn as one badge
              rather than three, because they are one fact: these people, there,
              then. */}
          {order.booking !== null && (
            <Badge tone="accent">
              {t('orderAtTable', {
                table: order.booking.tableNo ?? '—',
                time: order.booking.time,
                guests: order.booking.guests,
              })}
            </Badge>
          )}
          <Badge tone={statusTone(order.status)}>{t(`orderStatus_${order.status}`)}</Badge>
        </span>
      </div>

      {/* The code moved up into the heading, so this is the branch and the wait
          alone rather than the same string printed twice. */}
      <div className="order__meta">
        {order.branch.name ?? t('orderBranchFallback')} ·{' '}
        {formatWaiting(t, order.createdAt)}
        {/* A countdown on a pre-order would read "ready in 8,640 min", which is
            not a number anybody can act on — the day and hour it is due are
            below instead. */}
        {countdown !== null && !late && !order.scheduled &&
          ` · ${t('orderReadyIn', { time: countdown })}`}
      </div>

      {schedule !== null && (
        <p className="order__schedule">
          <Icon name="clock" size={15} />
          {schedule}
        </p>
      )}

      {late && (
        <p className="order__late">
          <Icon name="warning" size={15} />
          {t('orderLate')}
        </p>
      )}

      {/* Quantity, dish, what the line cost. The price is on the right of every
          line and the total below them is on the left of its own row, so the
          numbers do not read as one column somebody is meant to add up — and a
          line whose price looks wrong can be pointed at without opening the
          order.

          The dish itself is a link to its row on the branch's menu, because
          "what is in this, how long does it take, is it still on" is the next
          question after reading a ticket. Keyed by the dish rather than by its
          name: the same order cannot hold a dish twice (the API refuses it),
          and two dishes can share a name across a rename. */}
      <div className="order__items">
        {order.items.map((item) => (
          <div key={item.menuItemId} className="order__item">
            <span className="order__qty">{item.qty}×</span>
            {canOpenMenu ? (
              <Link
                to={routePath({
                  tab: 'Menu',
                  menu: { branchId: order.branch.id, itemId: item.menuItemId },
                })}
                className="order__dish order__dish--link"
                title={t('orderItemOpenInMenu', { dish: item.name })}
              >
                {item.name}
              </Link>
            ) : (
              <span className="order__dish">{item.name}</span>
            )}
            <span className="order__line-total num">{formatAmd(item.lineTotalAmd)}</span>
          </div>
        ))}
      </div>

      {order.notes !== null && (
        <p className="order__note">{t('orderNote', { note: order.notes })}</p>
      )}

      <div className="row spread">
        <span className="strong num">{formatAmd(order.totalAmd)}</span>
        <Badge tone={paymentTone(order.paymentStatus)}>
          {order.paymentStatus === null
            ? t('orderUnpaid')
            : t(`paymentStatus_${order.paymentStatus}`)}
        </Badge>
      </div>

      <div className="order__actions">
        {/* First in the row, and pushed to its left edge (`.order__aside`),
            which puts the status buttons together on the right where a thumb
            already rests. Reading the trail is a different kind of act from
            moving the order, and grouping it with them would put a ghost button
            between "Preparing" and "Cancel".

            The QR sits with it for the same reason — it hands the order's code
            to a scanner, which is looking something up rather than moving it
            along. `.order__aside` carries the two of them, so the pair stays on
            the left as one group however the row wraps. */}
        <div className="order__aside">
          <OrderHistoryDialog t={t} order={order} links={links} />
          <OrderQrDialog t={t} order={order} />
          {/* Only on a pre-order still waiting. An order already in front of
              somebody has no warning left to move, and a control that did
              nothing would be one more thing on a card a kitchen reads at a
              glance. */}
          {order.scheduled && (
            <OrderReminderDialog t={t} order={order} onSet={onSetReminder} />
          )}
        </div>

        {nextStatuses(order.status).map((next, index) =>
          // Handing the food over is not a status the counter asserts — it is
          // one the guest proves, by showing a code the card does not carry.
          // Its own dialog, and the only way to reach `completed`.
          next === OrderStatus.Completed ? (
            <OrderHandoverDialog
              key={next}
              t={t}
              order={order}
              busy={busy}
              onDone={onHandedOver}
            />
          ) : next === OrderStatus.Cancelled ? (
            <ConfirmDialog
              key={next}
              title={t('orderCancelTitle', { code: order.code })}
              description={t('orderCancelDesc')}
              confirmLabel={t('orderCancelConfirm')}
              busy={busy}
              onConfirm={() => go(next)}
              trigger={
                <Button variant="danger" className="btn--touch" disabled={busy}>
                  {t('orderCancelAction')}
                </Button>
              }
            />
          ) : (
            <Button
              key={next}
              // Only the ordinary next step is filled. A preparing order offers
              // two moves, and two solid buttons side by side would be two
              // things asking to be pressed on a screen somebody hits with the
              // side of a hand — the skip should be reachable without competing
              // with the step it skips. Both stay `btn--touch`: a shortcut you
              // have to aim at is not one.
              variant={index === 0 ? 'primary' : 'secondary'}
              className="btn--touch"
              disabled={busy}
              loading={pending === next}
              onClick={() => go(next)}
            >
              {t(`orderStatus_${next}`)}
            </Button>
          ),
        )}
      </div>
    </article>
  );
}
