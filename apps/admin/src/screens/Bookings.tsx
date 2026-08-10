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
import { routePath } from '../navigation';
import { Link } from '../router';
import { branchesOf, restaurantsOf } from '../scope';
import {
  ACTION_LABEL,
  STATUS_LABEL,
  actionsFor,
  barStyle,
  clockLabel,
  gridRows,
  gridSpan,
  hourMarks,
  shiftDate,
  statusTone,
  todayInYerevan,
} from '../bookings';
import {
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  IconButton,
  PageHeader,
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
 * **A day at a time, because that is how a book is read.** The date is in the
 * address alongside the branch, so "look at Saturday at Northern Ave" is a link
 * somebody can send rather than a sentence they have to re-enter.
 *
 * **Two views of the same day.** The list is what a phone can show and what
 * answers "who is coming next"; the grid answers "what is free at nine", which
 * is the question somebody standing at the door with four people is asking, and
 * no list answers it well.
 */

type View = 'list' | 'grid';

export function Bookings({
  branches,
  scope,
}: {
  /** The shell's flat branch list — what the two pickers are built from. */
  branches: StaffBranch[];
  /** Which day's book the address has open, or null for the screen's own
   *  defaults: every branch in reach, today. */
  scope: { branchId: string | null; date: string | null } | null;
}) {
  const t = useT();
  const toast = useToast();

  const [restaurantId, setRestaurantId] = useState('');
  const [branchId, setBranchId] = useState(scope?.branchId ?? '');
  const [date, setDate] = useState(scope?.date ?? todayInYerevan());
  const [view, setView] = useState<View>('list');

  const [items, setItems] = useState<StaffReservation[] | null>(null);
  const [tables, setTables] = useState<StaffTable[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const restaurantOptions = useMemo(() => restaurantsOf(branches), [branches]);
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
    } catch (err) {
      setError(errorText(t, err, 'errorLoadOrders'));
      setItems([]);
    }
  }, [branchId, date, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // The grid needs the room, and the room belongs to one branch — so it is
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

  return (
    <section className="gap">
      <PageHeader title={t('bookingsTitle')} description={t('bookingsDesc')} />

      <Toolbar>
        <Select
          value={restaurantId}
          onValueChange={(next) => {
            setRestaurantId(next);
            // Narrowing to a restaurant leaves a branch of another one behind,
            // and a book showing somebody else's tables is worse than one
            // showing all of them.
            setBranchId('');
          }}
          options={[
            { value: '', label: t('ordersRestaurantAll') },
            ...restaurantOptions.map(([id, name]) => ({ value: id, label: name })),
          ]}
          ariaLabel={t('ordersRestaurantAll')}
        />
        <Select
          value={branchId}
          onValueChange={setBranchId}
          options={[
            { value: '', label: t('ordersBranchAll') },
            ...branchOptions.map((branch) => ({
              value: branch.id,
              label: branch.name ?? branch.city,
              // Only while the list spans restaurants: two branches called
              // "Northern Ave" need telling apart then, and once one restaurant
              // is chosen the hint repeats the control above it.
              hint: restaurantId === '' ? branch.restaurantName : undefined,
            })),
          ]}
          ariaLabel={t('ordersBranchAll')}
        />

        {/* Arrows either side of the date, because that is how somebody moves
            through a book — a date picker alone makes "tomorrow" three clicks. */}
        <div className="book__date">
          <IconButton
            icon="chevronLeft"
            label={t('bookingPreviousDay')}
            onClick={() => setDate(shiftDate(date, -1))}
          />
          <input
            className="input"
            type="date"
            value={date}
            aria-label={t('bookingDate')}
            onChange={(event) => setDate(event.target.value)}
          />
          <IconButton
            icon="chevronRight"
            label={t('bookingNextDay')}
            onClick={() => setDate(shiftDate(date, 1))}
          />
          {date !== todayInYerevan() && (
            <Button variant="secondary" onClick={() => setDate(todayInYerevan())}>
              {t('bookingToday')}
            </Button>
          )}
        </div>

      </Toolbar>

      {error !== null && <Banner>{error}</Banner>}

      <SegmentedTabs
        value={view}
        onValueChange={setView}
        label={t('bookingView')}
        segments={[
          { value: 'list', label: t('bookingViewList'), count: items?.length },
          { value: 'grid', label: t('bookingViewGrid') },
        ]}
      >
        {items === null ? (
          <Skeleton height={64} count={4} />
        ) : items.length === 0 ? (
          <EmptyState
            icon="clock"
            title={t('bookingsEmptyTitle')}
            description={t('bookingsEmptyDesc', { date })}
          />
        ) : view === 'grid' && branchId !== '' && tables.length > 0 ? (
          <Grid
            items={items}
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
              // grid and got a list deserves to know which of the two reasons it
              // was.
              <Banner tone="warn">
                {branchId === '' ? t('bookingGridNeedsBranch') : t('bookingGridNeedsTables')}
              </Banner>
            )}
            <List items={items} tables={tables} busyId={busyId} onMove={move} onReseat={reseat} />
          </>
        )}
      </SegmentedTabs>
    </section>
  );
}

// ── the book as a list ──────────────────────────────────────────────────────

function List({
  items,
  tables,
  busyId,
  onMove,
  onReseat,
}: {
  items: StaffReservation[];
  tables: StaffTable[];
  busyId: string | null;
  onMove: (booking: StaffReservation, status: ReservationStatusValue) => void;
  onReseat: (booking: StaffReservation, tableId: string) => void;
}) {
  const t = useT();

  return (
    <Card className="book__list">
      {items.map((booking) => (
        <div key={booking.id} className="book__row">
          <span className="book__time">{booking.localTime}</span>
          <Badge tone={statusTone(booking.status)}>{t(STATUS_LABEL[booking.status])}</Badge>

          <span className="book__who">
            <span className="strong">{booking.customerName ?? t('bookingNoName')}</span>
            {/* The number is the point of the row when something goes wrong —
                a booking nobody can ring is a table nobody can free. */}
            {booking.customerPhone !== null && (
              <a className="faint" href={`tel:${booking.customerPhone}`}>
                {booking.customerPhone}
              </a>
            )}
          </span>

          <span className="faint">{t('bookingGuests', { count: booking.guests })}</span>

          {tables.length > 0 ? (
            <Select
              value={tables.find((table) => table.tableNo === booking.tableNo)?.id ?? ''}
              onValueChange={(tableId) => onReseat(booking, tableId)}
              options={tables.map((table) => ({
                value: table.id,
                label: t('bookingTableOption', { table: table.tableNo, seats: table.seats }),
              }))}
              ariaLabel={t('bookingTableFor', { guest: booking.customerName ?? '' })}
              disabled={busyId === booking.id}
            />
          ) : (
            <span className="faint">{booking.tableNo ?? '—'}</span>
          )}

          <span className="faint">{t('bookingDeposit', { amount: booking.depositAmd })}</span>

          {/* A dine-in order is placed against the booking, so the ticket is one
              press away rather than a search on the other screen. */}
          {booking.orderId !== null && (
            <Link to={routePath({ tab: 'Orders' })} className="faint">
              {t('bookingHasOrder')}
            </Link>
          )}

          <span className="book__actions">
            {actionsFor(booking.status).map((next) => (
              <Button
                key={next}
                variant={next === 'confirmed' || next === 'seated' ? 'primary' : 'secondary'}
                disabled={busyId === booking.id}
                onClick={() => onMove(booking, next)}
              >
                {t(ACTION_LABEL[next])}
              </Button>
            ))}
          </span>
        </div>
      ))}
    </Card>
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
    <Card className="book__grid">
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
          <div key={row.table.id} className="book__lane" style={{ gridTemplateColumns: `8rem 1fr` }}>
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

      {/* A booking whose table has gone is still a guest arriving. Below the
          room rather than dropped from it. */}
      {unplaced.length > 0 && (
        <div className="book__unplaced">
          <span className="strong">{t('bookingUnplaced', { count: unplaced.length })}</span>
          <List items={unplaced} tables={tables} busyId={busyId} onMove={onMove} onReseat={onReseat} />
        </div>
      )}

      {open !== null && (
        <div className="book__chosen">
          <List items={[open]} tables={tables} busyId={busyId} onMove={onMove} onReseat={onReseat} />
        </div>
      )}
    </Card>
  );
}
