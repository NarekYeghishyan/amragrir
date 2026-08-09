import { useEffect, useState } from 'react';
import {
  CustomerOrderFilter,
  type Language,
  OrderStatus,
  PaymentStatus,
} from '@amragrir/shared';
import type { AdminTranslationKey } from '@amragrir/i18n/admin';
import {
  CUSTOMER_ORDERS_PAGE_SIZE,
  NO_CUSTOMER_ORDER_FILTERS,
  SEARCH_DEBOUNCE_MS,
  api,
  errorText,
  hasCustomerOrderFilters,
  type AdminCustomerOrder,
  type AdminUser,
  type CustomerOrderFilters,
} from './api';
import { formatAmd, formatDateTime } from './format';
import { useLanguage } from './i18n';
import type { Translate } from './language';
import { routePath } from './navigation';
import { Link } from './router';
import {
  Badge,
  Banner,
  Button,
  Dialog,
  DialogBody,
  EmptyState,
  Icon,
  Pagination,
  SearchInput,
  SegmentedTabs,
  Skeleton,
  Toolbar,
  type Tone,
} from './ui';

/**
 * The filter segments, in the order a history reads.
 *
 * `all` first because it is where the dialog opens and where clearing returns
 * to. The other three are the whole state machine folded into the three answers
 * that mean something about an order somebody already placed — see
 * `CustomerOrderFilter` in `@amragrir/shared` for why these and not the board's
 * kitchen stages.
 */
const FILTER_TABS = [
  { value: CustomerOrderFilter.All, label: 'customerOrdersFilterAll' },
  { value: CustomerOrderFilter.Active, label: 'customerOrdersFilterActive' },
  { value: CustomerOrderFilter.Completed, label: 'customerOrdersFilterCompleted' },
  { value: CustomerOrderFilter.Cancelled, label: 'customerOrdersFilterCancelled' },
] as const satisfies readonly { value: CustomerOrderFilter; label: AdminTranslationKey }[];

/**
 * What one diner has ordered.
 *
 * A dialog off the orders count in the Customers table, the same shape the order
 * board's History and a person's Activity are: something you open about one row,
 * read, and close. The count was the only thing on that screen that said a
 * customer had ever bought anything, and it was a number with nothing behind it
 * — the way to see the orders was the board, which searches by name, which finds
 * every Aram in Yerevan.
 *
 * It reads `GET /admin/users/{id}/orders`, behind `platform:users` like the
 * table itself: this answers "what has this person bought", which crosses every
 * restaurant, rather than "what is this kitchen working on".
 */
export function CustomerOrdersDialog({
  user,
  canOpenOrders = false,
}: {
  user: AdminUser;
  /** Whether an order here is a link to itself on the Orders board. Gated on
   *  `orders:read`, which is what opens that screen — see `orderHref`. */
  canOpenOrders?: boolean;
}) {
  const { language, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [orders, setOrders] = useState<AdminCustomerOrder[] | null>(null);
  const [counts, setCounts] = useState<Record<CustomerOrderFilter, number> | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  /** Which order is open in place, or null when the list is a list. One at a
   *  time: two expanded orders is a scroll, and the question this gets opened
   *  for is about one of them. */
  const [opened, setOpened] = useState<string | null>(null);

  // What the list is showing, and what the typing hand is up to. Separate,
  // because the search is debounced: `query` changes per keystroke, `filters`
  // only when it settles, and only `filters` reaches the API. The same split the
  // order board makes, for the same reason.
  const [filters, setFilters] = useState<CustomerOrderFilters>(NO_CUSTOMER_ORDER_FILTERS);
  const [query, setQuery] = useState('');

  // The search settles before it is applied. Every keystroke reaching the API
  // would be a request per character inside a dialog somebody is reading.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const term = query.trim();
      setFilters((current) => (current.q === term ? current : { ...current, q: term }));
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    // Nothing is fetched until the dialog opens, and everything is dropped when
    // it closes: a page of twenty-five customers would otherwise be twenty-five
    // requests for dialogs nobody opened, and reopening must not show a list
    // held from last time — an order moves while the panel is looking elsewhere.
    // The filters go back to the whole history too: reopening a dialog still
    // narrowed to the search somebody ran about a different customer is a list
    // that looks empty for a reason nothing on screen explains.
    if (!open) {
      setOrders(null);
      setCounts(null);
      setTotal(0);
      setError(null);
      setPage(1);
      setOpened(null);
      setFilters(NO_CUSTOMER_ORDER_FILTERS);
      setQuery('');
      return;
    }

    let live = true;
    setOrders(null);
    // A new list, so whichever row was expanded is not in it.
    setOpened(null);

    api
      .userOrders(user.id, filters, page)
      .then((result) => {
        if (!live) {
          return;
        }
        setOrders(result.items);
        setCounts(result.counts);
        setTotal(result.total);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!live) {
          return;
        }
        setOrders([]);
        setTotal(0);
        setError(errorText(t, err, 'errorLoadCustomerOrders'));
      });

    // Closing mid-request must not land its answer in a dialog that is no longer
    // open — or, worse, in the next customer's.
    return () => {
      live = false;
    };
  }, [open, user.id, filters, page, t]);

  const who = user.name ?? t('customersNoName');
  const filtered = hasCustomerOrderFilters(filters);

  /** Back to the whole history — the state the dialog opens in. */
  const clear = (): void => {
    setQuery('');
    setFilters(NO_CUSTOMER_ORDER_FILTERS);
    setPage(1);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={t('customerOrdersTitle', { name: who })}
      description={t('customerOrdersDesc')}
      // Wide, because a row is a code, a restaurant, a date and a total, and an
      // opened one is a table of dishes under all four.
      wide
      trigger={
        // The count itself is the control. A button beside it would be a second
        // thing to aim at saying the same number, and the number is what
        // somebody is already looking at when they wonder what is behind it.
        <button
          type="button"
          className="link-count"
          aria-label={t('customerOrdersOpen', { name: who })}
        >
          {user.ordersCount}
        </button>
      }
    >
      <DialogBody>
        {error !== null && <Banner>{error}</Banner>}

        {/* Search above the segments, the way the order board has it: the two
            are different questions — "which order" and "how did it end" — and
            the counts on the segments are taken under whatever is typed here,
            so searching a code tells you which segment holds it before anybody
            clicks one. */}
        <Toolbar>
          <SearchInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('customerOrdersSearch')}
            aria-label={t('customerOrdersSearchHint')}
          />
          {filtered && (
            <Button icon="close" onClick={clear}>
              {t('customerOrdersFiltersClear')}
            </Button>
          )}
        </Toolbar>

        {orders === null ? (
          <Skeleton count={4} height={56} />
        ) : (
          <SegmentedTabs
            value={filters.status}
            onValueChange={(status) => {
              setFilters((current) => ({ ...current, status }));
              // A different filter is a different list; page 3 of the old one
              // means nothing in it.
              setPage(1);
            }}
            label={t('customerOrdersFilterLabel')}
            segments={FILTER_TABS.map((tab) => ({
              value: tab.value,
              label: t(tab.label),
              // Counted by the API under the same search, so a segment saying
              // "1" means one, not one among the page it happened to fetch.
              count: counts?.[tab.value],
            }))}
          >
            {orders.length === 0 ? (
              <EmptyState
                icon="orders"
                // Three different nothings, and each says its own. A customer
                // who has never ordered is not the same as a search that missed,
                // and neither is a filter with nothing under it — the last is
                // the one where the counts on the other segments are the answer.
                title={
                  filtered ? t('customerOrdersNoMatchTitle') : t('customerOrdersEmptyTitle')
                }
                description={
                  filtered ? t('customerOrdersNoMatchDesc') : t('customerOrdersEmptyDesc')
                }
                action={
                  filtered && (
                    <Button icon="close" onClick={clear}>
                      {t('customerOrdersFiltersClear')}
                    </Button>
                  )
                }
              />
            ) : (
              <>
                <ul className="order-list">
                  {orders.map((order) => (
                    <CustomerOrderRow
                      key={order.id}
                      t={t}
                      order={order}
                      language={language}
                      open={opened === order.id}
                      onToggle={() =>
                        setOpened((current) => (current === order.id ? null : order.id))
                      }
                      href={orderHref(order, canOpenOrders)}
                      // The dialog has to go before the screen under it changes:
                      // following the link swaps Customers for Orders, and a
                      // modal left open over the destination is a modal about a
                      // row that is no longer on screen.
                      onFollow={() => setOpen(false)}
                    />
                  ))}
                </ul>

                <Pagination
                  page={page}
                  pageSize={CUSTOMER_ORDERS_PAGE_SIZE}
                  total={total}
                  onPage={setPage}
                  labels={{
                    nav: t('pagerLabel'),
                    previous: t('pagerPrevious'),
                    next: t('pagerNext'),
                    page: (n) => t('pagerPage', { page: n }),
                    range: t('pagerRange', {
                      from: (page - 1) * CUSTOMER_ORDERS_PAGE_SIZE + 1,
                      to: Math.min(page * CUSTOMER_ORDERS_PAGE_SIZE, total),
                      total,
                    }),
                  }}
                />
              </>
            )}
          </SegmentedTabs>
        )}
      </DialogBody>
    </Dialog>
  );
}

/**
 * Where an order in this list leads, or null when it leads nowhere.
 *
 * The order board, scoped to the branch that took it and narrowed to the one
 * order: `/orders?restaurant=…&branch=…&order=CODE`. The same address a line of
 * somebody's activity links to, deliberately — an order should open in the same
 * place from wherever the panel names it, and the board is the screen that can
 * actually move one along.
 *
 * The code travels rather than the id because the board searches by code, and
 * because a code is the thing somebody reads off this row and recognises on the
 * card it lands on.
 *
 * Null for an account without `orders:read`. `platform:users` and `orders:read`
 * are held together by every role that has either today, so in practice this
 * link is always offered — it is checked anyway because a link to a tab the
 * sidebar does not show is a dead end, and because the pair is splittable.
 */
export function orderHref(
  order: Pick<AdminCustomerOrder, 'restaurantId' | 'branchId' | 'code'>,
  canOpenOrders: boolean,
): string | null {
  return canOpenOrders
    ? routePath({
        tab: 'Orders',
        scope: {
          restaurantId: order.restaurantId,
          branchId: order.branchId,
          orderCode: order.code,
        },
      })
    : null;
}

/**
 * The one line of an order that is not on the row: where it was bought.
 *
 * A branch with no name of its own reads as its restaurant alone rather than as
 * an empty half of a sentence — a single-branch restaurant is the common case
 * here, and "Dolmama · " is not a place.
 */
export function placeLine(order: Pick<AdminCustomerOrder, 'restaurantName' | 'branchName'>): string {
  return order.branchName === null
    ? order.restaurantName
    : `${order.restaurantName} · ${order.branchName}`;
}

/**
 * Colour follows how far along the order is — the same mapping the board uses,
 * so one order is not two colours on two screens.
 */
export function statusTone(status: OrderStatus): Tone {
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

export function paymentTone(status: PaymentStatus | null): Tone {
  if (status === null) {
    return 'warn';
  }
  if (status === PaymentStatus.Captured || status === PaymentStatus.Authorized) {
    return 'good';
  }
  return status === PaymentStatus.Failed ? 'danger' : 'neutral';
}

/**
 * How an order was paid for, in one phrase — or that it never was.
 *
 * Method and outcome together, because either alone answers half: "Card" does
 * not say whether it went through, and "Refunded" does not say what was
 * refunded. An order with no payment row is a basket somebody abandoned at
 * checkout, which is a real state and worth naming rather than leaving blank.
 */
export function paymentLine(t: Translate, order: AdminCustomerOrder): string {
  if (order.payment === null) {
    return t('orderUnpaid');
  }
  return `${t(`paymentMethod_${order.payment.method}`)} · ${t(
    `paymentStatus_${order.payment.status}`,
  )}`;
}

/** One line of the bill. `strong` marks the total, which is the only one of
 *  them that is not an ingredient of the others. */
export interface BillLine {
  label: string;
  amount: string;
  strong?: boolean;
}

/**
 * The money, as the rows of a small table — label and amount, in the order a
 * bill reads.
 *
 * A discount and a deposit are omitted when they are zero rather than shown as
 * `0 ֏`: most orders have neither, and four lines of nothing is a bill that
 * hides the two numbers that matter. The deposit is marked as credited in its
 * own label, because it was taken at booking and is **not** added to the total —
 * a line that looked like a charge would make every dine-in bill read as wrong.
 */
export function billLines(t: Translate, order: AdminCustomerOrder): BillLine[] {
  const lines: BillLine[] = [
    { label: t('customerOrderSubtotal'), amount: formatAmd(order.subtotalAmd) },
  ];

  if (order.serviceFeeAmd !== 0) {
    lines.push({ label: t('customerOrderServiceFee'), amount: formatAmd(order.serviceFeeAmd) });
  }
  if (order.discountAmd !== 0) {
    // Negative, because it came off. The sign is the whole information in a
    // column of amounts that otherwise all add up.
    lines.push({ label: t('customerOrderDiscount'), amount: formatAmd(-order.discountAmd) });
  }
  if (order.depositAmd !== 0) {
    lines.push({ label: t('customerOrderDeposit'), amount: formatAmd(order.depositAmd) });
  }

  lines.push({ label: t('customerOrderTotal'), amount: formatAmd(order.totalAmd), strong: true });
  return lines;
}

/**
 * One order: a row that says what it was, and everything else underneath when
 * it is opened.
 *
 * The row is a button rather than a link, and the link is a separate control
 * inside the opened half. Opening one is looking at it here; the link leaves
 * this screen for another, and a row that did both would make "which of the two
 * did I just do" a question about where in the row somebody clicked.
 */
function CustomerOrderRow({
  t,
  order,
  language,
  open,
  onToggle,
  href,
  onFollow,
}: {
  t: Translate;
  order: AdminCustomerOrder;
  language: Language;
  open: boolean;
  onToggle: () => void;
  /** Where this order opens on the board, or null when this account cannot
   *  open that screen. */
  href: string | null;
  onFollow: () => void;
}) {
  return (
    <li className="order-list__entry">
      <button
        type="button"
        className="order-list__row"
        aria-expanded={open}
        onClick={onToggle}
      >
        {/* The order's name. It used to be the pickup code, which is not
            something this screen has any more — the collection code is the
            counter's business and the API stopped sending it anywhere near a
            staff screen. See `StaffOrder`. */}
        <span className="order-list__code num">{order.code}</span>
        <span className="order-list__where truncate">{placeLine(order)}</span>
        <time className="order-list__at" dateTime={order.createdAt}>
          {formatDateTime(order.createdAt, language)}
        </time>
        <span className="order-list__count muted">{t.plural('dishCount', order.itemsCount)}</span>
        <span className="order-list__total num strong">{formatAmd(order.totalAmd)}</span>
        <Badge tone={statusTone(order.status)}>{t(`orderStatus_${order.status}`)}</Badge>
      </button>

      {open && (
        <div className="order-list__detail">
          {/* The code again, labelled. The row above prints it bare, which is
              enough to recognise a line by; this is the one that can be read
              out over a support call as "the order code". */}
          <dl className="order-facts">
            <div>
              <dt>{t('customerOrderCode')}</dt>
              <dd className="num">{order.code}</dd>
            </div>
            <div>
              <dt>{t('customerOrderMode')}</dt>
              <dd>{t(`serviceMode_${order.serviceMode}`)}</dd>
            </div>
            <div>
              <dt>{t('customerOrderPayment')}</dt>
              <dd>
                <Badge tone={paymentTone(order.payment?.status ?? null)}>
                  {paymentLine(t, order)}
                </Badge>
              </dd>
            </div>
            {order.tableNo !== null && (
              <div>
                <dt>{t('customerOrderTable')}</dt>
                <dd>{order.tableNo}</dd>
              </div>
            )}
            {order.readyAt !== null && (
              <div>
                <dt>{t('customerOrderReadyAt')}</dt>
                <dd>
                  <time dateTime={order.readyAt}>{formatDateTime(order.readyAt, language)}</time>
                </dd>
              </div>
            )}
          </dl>

          {/* Quantity, dish, unit price, line total. The unit price is here and
              not on the board's cards because this is a bill being read rather
              than a ticket being worked: "why is this 5 800" is answered by the
              2 900 beside it. */}
          <table className="table table--tight">
            <thead>
              <tr>
                <th className="table__num">{t('customerOrderQty')}</th>
                <th>{t('customerOrderDish')}</th>
                <th className="table__num">{t('customerOrderUnit')}</th>
                <th className="table__num">{t('customerOrderLine')}</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                // Keyed by the dish: the same order cannot hold one twice (the
                // API refuses it), and two dishes can share a name.
                <tr key={item.menuItemId}>
                  <td className="table__num">{item.qty}×</td>
                  <td>{item.name}</td>
                  <td className="table__num num">{formatAmd(item.unitPriceAmd)}</td>
                  <td className="table__num num">{formatAmd(item.lineTotalAmd)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <dl className="bill">
            {billLines(t, order).map((line) => (
              <div key={line.label} className={line.strong === true ? 'bill__row strong' : 'bill__row'}>
                <dt>{line.label}</dt>
                <dd className="num">{line.amount}</dd>
              </div>
            ))}
          </dl>

          {order.notes !== null && <p className="order__note">{t('orderNote', { note: order.notes })}</p>}

          {href !== null && (
            <div className="row row--end">
              <Link to={href} className="btn btn--secondary" onClick={onFollow}>
                <Icon name="orders" size={16} />
                {t('customerOrderOpenOnBoard')}
              </Link>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
