import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  api,
  errorText,
  type ReservationStatusValue,
  type StaffBranch,
  type StaffReservation,
  type StaffTable,
} from '../api';
import { useT } from '../i18n';
import type { Translate } from '../language';
import { routePath, type BookingScope } from '../navigation';
import { Link, navigate } from '../router';
import { formatAmd } from '../format';
import { branchesOf, restaurantsOf, showsBranchFilter, soleBranchOf } from '../scope';
import {
  ACTION_LABEL,
  BOOKING_STAGES,
  STATUS_LABEL,
  actionsFor,
  barStyle,
  bookingsPartial,
  clockLabel,
  coversOf,
  gridRows,
  gridSpan,
  hasBookingFilters,
  hourMarks,
  inStage,
  shiftDate,
  stageCounts,
  statusTone,
  todayInYerevan,
  type BookingStage,
} from '../bookings';
import {
  Badge,
  Banner,
  Button,
  EmptyState,
  Icon,
  IconButton,
  PageHeader,
  SectionTitle,
  SegmentedTabs,
  Select,
  Skeleton,
  Toolbar,
  useToast,
} from '../ui';

/**
 * The book for one service — who is coming, when, and to which table.
 *
 * The endpoints behind this screen were written months ago and never had
 * anything calling them: `GET /restaurant/reservations` and its status PATCH
 * were tested, permissioned, and unreachable. `reservations:read` was granted
 * to every restaurant role and opened nothing.
 *
 * **Built as the order board is built**, because it is the same job at a
 * different hour: the same header, the same toolbar, the same stage strip, and
 * the same cards on the same grid. A shift moves between the two all evening,
 * and two screens that answer "who is next" with different furniture make the
 * second one something to learn rather than something to read. What is genuinely
 * this screen's own — the day stepper and the room view — is what differs, and
 * it differs visibly.
 *
 * **A day at a time, because that is how a book is read.** The day, the branch
 * and the restaurant are all in the address, so "look at Saturday at Northern
 * Ave" is a link somebody can send rather than a sentence they re-enter at the
 * other end.
 *
 * **Two views of the same day.** The list is what a phone can show and what
 * answers "who is coming next"; the room answers "what is free at nine", which
 * is the question somebody standing at the door with four people is asking, and
 * no list answers it well.
 */

type View = 'list' | 'grid';

/**
 * The "no restaurant / no branch chosen" option, as a value.
 *
 * Not `''`, for the reason the order board says: Radix reserves the empty
 * string for the placeholder state, so an option carrying it renders a trigger
 * reading "Choose…" instead of "All restaurants" — on this screen that was both
 * pickers, in their default state, on arrival.
 */
const ANY = '*';

export function Bookings({
  branches,
  scope,
}: {
  /** The shell's flat branch list — what the two pickers are built from. */
  branches: StaffBranch[];
  /** Which day's book the address has open, or null for the screen's own
   *  defaults: every branch in reach, today. */
  scope: BookingScope | null;
}) {
  const t = useT();
  const toast = useToast();

  // The scope as plain strings — what the pickers speak and what an effect can
  // depend on. The object itself is rebuilt from the URL on every render of the
  // shell, so depending on *it* would be depending on a new identity each time.
  const restaurantId = scope?.restaurantId ?? '';
  const branchId = scope?.branchId ?? '';
  // The one part of the scope with a default that is not "everything": a book
  // is always a book of some day, and today is the one somebody opened it for.
  const date = scope?.date ?? todayInYerevan();

  const [view, setView] = useState<View>('list');
  const [stage, setStage] = useState<BookingStage>('all');

  const [items, setItems] = useState<StaffReservation[] | null>(null);
  const [total, setTotal] = useState(0);
  const [tables, setTables] = useState<StaffTable[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const restaurants = useMemo(() => restaurantsOf(branches), [branches]);
  const branchOptions = useMemo(
    () => branchesOf(branches, restaurantId),
    [branches, restaurantId],
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const book = await api.reservations({
        ...(branchId === '' ? {} : { branchId }),
        date,
      });
      setItems(book.items);
      setTotal(book.total);
    } catch (err) {
      setError(errorText(t, err, 'errorLoadOrders'));
      setItems([]);
      setTotal(0);
    }
  }, [branchId, date, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // The room needs the room, and a room belongs to one branch — so it is
  // fetched only when the picker names one. Across every branch in reach there
  // is no single set of rows to draw, and the list is the honest view.
  useEffect(() => {
    let live = true;
    if (branchId === '') {
      setTables([]);
      return () => {
        live = false;
      };
    }
    api
      .tables(branchId)
      .then((result) => {
        if (live) {
          setTables(result.items.filter((table) => table.isActive));
        }
      })
      .catch(() => {
        if (live) {
          setTables([]);
        }
      });
    return () => {
      live = false;
    };
  }, [branchId]);

  /**
   * Point the book at a restaurant, a branch and a day.
   *
   * A navigation rather than a `setState`, exactly as the order board does it:
   * the scope *is* the address, so whoever steps to Saturday and copies the URL
   * out of the bar sends the day they are looking at rather than the one they
   * arrived on. `replace`, so the back button leaves for wherever they came
   * from instead of walking back through every arrow press on the way.
   */
  const scopeTo = (next: Partial<BookingScope>): void => {
    navigate(
      routePath({
        tab: 'Bookings',
        book: {
          restaurantId: restaurantId || null,
          branchId: branchId || null,
          date,
          ...next,
        },
      }),
      { replace: true },
    );
  };

  const clear = (): void => {
    // The day stays. Clearing a filter means "show me every branch again", not
    // "take me back to today" — somebody looking at Saturday who widens the
    // scope is still asking about Saturday.
    scopeTo({ restaurantId: null, branchId: null });
  };

  const move = async (booking: StaffReservation, status: ReservationStatusValue) => {
    setBusyId(booking.id);
    try {
      await api.setReservationStatus(booking.id, status);
      await load();
      toast.success(t('bookingMoved', { status: t(STATUS_LABEL[status]) }));
    } catch (err) {
      toast.error(errorText(t, err, 'errorUpdateBranch'));
    } finally {
      setBusyId(null);
    }
  };

  const reseat = async (booking: StaffReservation, tableId: string) => {
    setBusyId(booking.id);
    try {
      await api.setReservationTable(booking.id, tableId);
      await load();
      toast.success(t('bookingReseated'));
    } catch (err) {
      toast.error(errorText(t, err, 'errorUpdateBranch'));
    } finally {
      setBusyId(null);
    }
  };

  const day = items ?? [];
  const counts = stageCounts(day);
  const shown = day.filter((booking) => inStage(booking.status, stage));
  const filtered = hasBookingFilters(restaurantId, branchId);
  const partial = bookingsPartial(day.length, total);

  // The list and the room, as the panel of whichever strip ends up around them.
  // One definition rather than two branches rendering the same book, which is
  // how the two would come to disagree.
  const book =
    shown.length === 0 ? (
      <EmptyState
        icon="clock"
        title={
          stage === 'all'
            ? filtered
              ? t('bookingsEmptyFilteredTitle')
              : t('bookingsEmptyTitle')
            : t('bookingsEmptyStageTitle')
        }
        description={
          stage === 'all' ? t('bookingsEmptyDesc', { date }) : t('bookingsEmptyStageDesc')
        }
        action={
          filtered && (
            <Button icon="close" onClick={clear}>
              {t('ordersFiltersClear')}
            </Button>
          )
        }
      />
    ) : view === 'grid' && branchId !== '' && tables.length > 0 ? (
      <Grid
        items={shown}
        tables={tables}
        date={date}
        busyId={busyId}
        onMove={move}
        onReseat={reseat}
      />
    ) : (
      <>
        {view === 'grid' && (
          // Said rather than silently falling back: somebody who pressed the
          // room and got a list deserves to know which of the two reasons it
          // was.
          <Banner tone="warn">
            {branchId === '' ? t('bookingGridNeedsBranch') : t('bookingGridNeedsTables')}
          </Banner>
        )}
        <div className="board">
          {shown.map((booking) => (
            <BookingCard
              key={booking.id}
              t={t}
              booking={booking}
              tables={tables}
              busy={busyId === booking.id}
              onMove={(status) => void move(booking, status)}
              onReseat={(tableId) => void reseat(booking, tableId)}
            />
          ))}
        </div>
      </>
    );

  return (
    <section>
      <PageHeader
        title={t('bookingsTitle')}
        description={t('bookingsDesc')}
        actions={
          // Covers, not bookings — the number a kitchen staffs and preps for,
          // and the one thing a book knows that counting its rows does not say.
          // Where the board puts its live/offline badge, for the same reason:
          // the state of the whole screen belongs beside its name.
          items !== null &&
          day.length > 0 && (
            <Badge tone="accent">{t('bookingCovers', { count: coversOf(day) })}</Badge>
          )
        }
      />

      {error !== null && <Banner>{error}</Banner>}
      {partial && <Banner tone="warn">{t('bookingsPartial', { shown: day.length, total })}</Banner>}

      {/* Scope, above the stage tabs. The two are different questions — "which
          bookings am I looking at" and "how far along are they" — and the day
          belongs with the first: it is the largest thing being chosen here. */}
      <Toolbar>
        {/* Only when there is a choice to make. Most kitchens are one branch of
            one restaurant, and two selects reading "All" is furniture. */}
        {restaurants.length > 1 && (
          <Select
            value={restaurantId || ANY}
            onValueChange={(value) => {
              const next = value === ANY ? '' : value;
              // Changing restaurant drops the branch: the old one belongs to
              // the old restaurant. Unless the new one has a single branch,
              // which is then selected outright — asking "which branch" when
              // there is one answer is asking somebody to confirm a decision
              // already made for them.
              scopeTo({
                restaurantId: next || null,
                branchId: soleBranchOf(branches, next) || null,
              });
            }}
            ariaLabel={t('ordersRestaurantAll')}
            options={[
              { value: ANY, label: t('ordersRestaurantAll') },
              ...restaurants.map(([id, name]) => ({ value: id, label: name })),
            ]}
          />
        )}

        {showsBranchFilter(restaurantId, branchOptions.length) && (
          <Select
            value={branchId || ANY}
            onValueChange={(value) => scopeTo({ branchId: value === ANY ? null : value })}
            ariaLabel={t('ordersBranchAll')}
            options={[
              { value: ANY, label: t('ordersBranchAll') },
              ...branchOptions.map((branch) => ({
                value: branch.id,
                label: branch.name ?? branch.city,
                // Only while the list spans restaurants. Two branches called
                // "Northern Ave" need telling apart then; once one restaurant
                // is chosen the hint repeats the control above it.
                hint: restaurantId === '' ? branch.restaurantName : undefined,
              })),
            ]}
          />
        )}

        {/* Arrows either side of the date, because that is how somebody moves
            through a book — a date picker alone makes "tomorrow" three clicks.
            This is the control the order board has no equivalent of, so it is
            the one thing in the strip that does not look like the board's. */}
        <div className="book__date">
          <IconButton
            icon="chevronLeft"
            label={t('bookingPreviousDay')}
            onClick={() => scopeTo({ date: shiftDate(date, -1) })}
          />
          <input
            className="input book__date-input"
            type="date"
            value={date}
            aria-label={t('bookingDate')}
            onChange={(event) => scopeTo({ date: event.target.value })}
          />
          <IconButton
            icon="chevronRight"
            label={t('bookingNextDay')}
            onClick={() => scopeTo({ date: shiftDate(date, 1) })}
          />
        </div>

        {date !== todayInYerevan() && (
          <Button icon="clock" onClick={() => scopeTo({ date: todayInYerevan() })}>
            {t('bookingToday')}
          </Button>
        )}

        {filtered && (
          <Button icon="close" onClick={clear}>
            {t('ordersFiltersClear')}
          </Button>
        )}
      </Toolbar>

      {items === null ? (
        <Skeleton count={3} height={220} />
      ) : (
        <SegmentedTabs
          value={stage}
          onValueChange={setStage}
          label={t('bookingStageLabel')}
          segments={BOOKING_STAGES.map((tab) => ({
            value: tab.value,
            label: t(tab.label),
            count: counts[tab.value],
          }))}
          // The view switch rides beside the stages rather than wrapping them:
          // which bookings, and how to look at them, are not the same choice,
          // and nesting one strip inside the other would say they were. Drawn
          // smaller for the same reason the board's Paid sub-filter is — a
          // second strip the size of the first competes with it.
          actions={
            <div className="book__views">
              <SegmentedTabs
                value={view}
                onValueChange={setView}
                label={t('bookingView')}
                segments={[
                  { value: 'list', label: t('bookingViewList') },
                  { value: 'grid', label: t('bookingViewGrid') },
                ]}
              >
                {null}
              </SegmentedTabs>
            </div>
          }
        >
          {book}
        </SegmentedTabs>
      )}
    </section>
  );
}

// ── one booking ─────────────────────────────────────────────────────────────

/**
 * One booking, as the order board draws one order.
 *
 * The same card, the same title row, the same inset block and the same actions
 * row pushed to the card's bottom edge — `.booking` shares the board's rules
 * rather than restating them, so the two screens cannot drift apart by a
 * padding value.
 *
 * What it carries is what a host acts on: when, who, how many, which table, and
 * what has been paid. The phone is a `tel:` link because a booking nobody can
 * ring is a table nobody can free.
 *
 * Exported for `render.spec.tsx` alone. The screen around it paints a skeleton
 * on its first frame and fills in from an effect, so a test that renders only
 * the screen never sees a card — which left the whole of what this panel
 * actually shows a shift with nothing asserting it renders at all.
 */
export function BookingCard({
  t,
  booking,
  tables,
  busy,
  onMove,
  onReseat,
}: {
  t: Translate;
  booking: StaffReservation;
  /** The room, when one branch is in scope — what makes the table a picker
   *  rather than a label. Empty across branches, and the card says the table
   *  number instead of offering to move it somewhere it cannot see. */
  tables: StaffTable[];
  busy: boolean;
  onMove: (status: ReservationStatusValue) => void;
  onReseat: (tableId: string) => void;
}) {
  const [pending, setPending] = useState<ReservationStatusValue | null>(null);
  useEffect(() => {
    if (!busy) {
      setPending(null);
    }
  }, [busy]);

  const go = (status: ReservationStatusValue): void => {
    setPending(status);
    onMove(status);
  };

  const seatedAt = tables.find((table) => table.tableNo === booking.tableNo);

  return (
    <article className="booking">
      <div className="row spread">
        {/* The hour is this card's name, the way the code is an order's: it is
            what a host is scanning for and the only thing that has to be
            readable from arm's length. */}
        <span className="booking__title">
          <span className="booking__time num">{booking.localTime}</span>
        </span>
        <span className="row row--tight">
          {/* A dine-in order was placed against this booking, so the ticket is
              one press away rather than a search on the other screen. */}
          {booking.orderId !== null && (
            <Link to={routePath({ tab: 'Orders' })} className="booking__order">
              <Badge tone="accent">{t('bookingHasOrder')}</Badge>
            </Link>
          )}
          <Badge tone={statusTone(booking.status)}>{t(STATUS_LABEL[booking.status])}</Badge>
        </span>
      </div>

      <div className="booking__meta">
        {booking.branch.name ?? t('orderBranchFallback')} ·{' '}
        {t('bookingGuests', { count: booking.guests })}
      </div>

      {/* Who is coming, in the block the order board gives its lines — the part
          of the card somebody reads out over the phone. */}
      <div className="booking__who">
        <span className="strong">{booking.customerName ?? t('bookingNoName')}</span>
        {booking.customerPhone !== null && (
          <a className="booking__phone" href={`tel:${booking.customerPhone}`}>
            <Icon name="phone" size={14} />
            {booking.customerPhone}
          </a>
        )}
      </div>

      <div className="booking__table">
        {tables.length > 0 ? (
          <Select
            value={seatedAt?.id ?? ''}
            onValueChange={onReseat}
            options={tables.map((table) => ({
              value: table.id,
              label: t('bookingTableOption', { table: table.tableNo, seats: table.seats }),
            }))}
            placeholder={t('bookingNoTable')}
            ariaLabel={t('bookingTableFor', { guest: booking.customerName ?? '' })}
            disabled={busy}
          />
        ) : (
          <span className="faint">
            {booking.tableNo === null
              ? t('bookingNoTable')
              : t('bookingAtTable', { table: booking.tableNo })}
          </span>
        )}
      </div>

      <div className="row spread">
        <span className="strong num">{formatAmd(booking.depositAmd)}</span>
        <Badge tone={booking.depositCredited ? 'good' : 'neutral'}>
          {booking.depositCredited ? t('bookingDepositCredited') : t('bookingDepositHeld')}
        </Badge>
      </div>

      {/* The board's own row: slack above it, so the buttons sit on the card's
          bottom edge and line up across the grid however tall a card gets. */}
      <div className="booking__actions">
        {actionsFor(booking.status).map((next, index) => (
          <Button
            key={next}
            // Only the ordinary next step is filled, exactly as on the board:
            // two solid buttons side by side are two things asking to be
            // pressed, and "No show" should never compete with "Seated".
            variant={index === 0 ? 'primary' : next === 'cancelled' ? 'danger' : 'secondary'}
            className="btn--touch"
            disabled={busy}
            loading={pending === next}
            onClick={() => go(next)}
          >
            {t(ACTION_LABEL[next])}
          </Button>
        ))}
      </div>
    </article>
  );
}

// ── the book as a room ──────────────────────────────────────────────────────

/**
 * Tables down the side, time across the top.
 *
 * The view that answers "what is free at nine", which a list answers badly and
 * which is what somebody at the door with four people needs. Every table gets a
 * row, including the empty ones — a grid of only the busy tables would hide
 * exactly the answer being looked for.
 */
function Grid({
  items,
  tables,
  date,
  busyId,
  onMove,
  onReseat,
}: {
  items: StaffReservation[];
  tables: StaffTable[];
  date: string;
  busyId: string | null;
  onMove: (booking: StaffReservation, status: ReservationStatusValue) => void;
  onReseat: (booking: StaffReservation, tableId: string) => void;
}) {
  const t = useT();
  const [chosen, setChosen] = useState<string | null>(null);

  // 90 minutes is the platform's default and the only seating length the book
  // knows here — the bars are a picture of the evening rather than a promise
  // about any one branch's policy, and fetching that policy per branch to draw
  // them slightly differently would not change a decision anybody makes.
  const { rows, unplaced } = gridRows(tables, items, 90, date);
  const span = gridSpan(rows.flatMap((row) => row.bookings));
  const marks = hourMarks(span);
  const open = items.find((booking) => booking.id === chosen) ?? null;

  return (
    <div className="book__room">
      <div className="book__grid">
        <div className="book__scroll">
          <div className="book__head" style={{ gridTemplateColumns: `8rem 1fr` }}>
            <span className="faint">{t('bookingTable')}</span>
            <div className="book__marks">
              {marks.map((minute) => (
                <span key={minute} className="book__mark">
                  {clockLabel(minute)}
                </span>
              ))}
            </div>
          </div>

          {rows.map((row) => (
            <div
              key={row.table.id}
              className="book__lane"
              style={{ gridTemplateColumns: `8rem 1fr` }}
            >
              <span className="book__table">
                <span className="strong">{row.table.tableNo}</span>
                <span className="faint">{t('bookingSeats', { count: row.table.seats })}</span>
              </span>
              <div className="book__track">
                {row.bookings.map((entry) => (
                  <button
                    key={entry.reservation.id}
                    type="button"
                    className={`book__bar book__bar--${statusTone(entry.reservation.status)}`}
                    style={barStyle(entry, span)}
                    disabled={busyId === entry.reservation.id}
                    onClick={() =>
                      setChosen(chosen === entry.reservation.id ? null : entry.reservation.id)
                    }
                  >
                    <span className="book__bar-time">{entry.reservation.localTime}</span>
                    <span className="book__bar-who">
                      {entry.reservation.customerName ?? t('bookingNoName')} ·{' '}
                      {entry.reservation.guests}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* A pressed bar opens as the same card the list is made of, so acting on
          a booking is one thing to learn rather than two. */}
      {open !== null && (
        <div className="board">
          <BookingCard
            t={t}
            booking={open}
            tables={tables}
            busy={busyId === open.id}
            onMove={(status) => onMove(open, status)}
            onReseat={(tableId) => onReseat(open, tableId)}
          />
        </div>
      )}

      {/* A booking whose table has gone is still a guest arriving. Below the
          room and under its own heading rather than dropped from it — and said
          out loud, because a card with no bar above it otherwise looks like a
          rendering fault. */}
      {unplaced.filter((booking) => booking.id !== open?.id).length > 0 && (
        <div className="book__unplaced">
          <SectionTitle>{t('bookingUnplaced', { count: unplaced.length })}</SectionTitle>
          <div className="board">
            {unplaced
              .filter((booking) => booking.id !== open?.id)
              .map((booking) => (
                <BookingCard
                  key={booking.id}
                  t={t}
                  booking={booking}
                  tables={tables}
                  busy={busyId === booking.id}
                  onMove={(status) => onMove(booking, status)}
                  onReseat={(tableId) => onReseat(booking, tableId)}
                />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
