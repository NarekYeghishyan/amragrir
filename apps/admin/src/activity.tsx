import { useEffect, useState } from 'react';
import {
  AuditAction,
  AuditEntity,
  Language,
  OrderEventType,
  ReservationStatus,
  StaffRole,
} from '@amragrir/shared';
import {
  ACTIVITY_PAGE_SIZE,
  api,
  errorText,
  type ActivityEntry,
  type StaffListEntry,
} from './api';
import { formatAmd, formatDateTime, pickLabel } from './format';
import { useLanguage } from './i18n';
import type { Translate } from './language';
import { routePath } from './navigation';
import { Link } from './router';
import { serviceList } from './services';
import { Banner, Button, Dialog, DialogBody, EmptyState, Pagination, Skeleton } from './ui';

/**
 * Which screens behind the feed this account can open.
 *
 * Every entry names something that exists on another screen — a dish, an order,
 * the branch it happened in — and each of those screens is behind a permission
 * this account may not hold. Three booleans rather than the permission set,
 * matching how the order board is told what its own timeline may offer, and the
 * API decides regardless of what the panel renders.
 *
 * All three are granted together today: `staff:activity` sits on the restaurant
 * admin role, which holds `menu:read`, `orders:read` and `branch:read` as well.
 * They are separate anyway because that permission exists to be splittable — a
 * role that can read a person's record without being able to open the menu is
 * the exact future it was written for, and a link to a tab the sidebar does not
 * show is a dead end.
 */
export interface ActivityLinks {
  /** `menu:read` — the dish a menu entry is about. */
  menu: boolean;
  /** `orders:read` — the order an order entry is about. */
  orders: boolean;
  /** `branch:read` — the branch, or the restaurant, it happened in. */
  restaurants: boolean;
}

/** No links at all: every entry reads as the text it was before there were
 *  any. The default, so a caller that says nothing offers no dead ends. */
export const NO_ACTIVITY_LINKS: ActivityLinks = {
  menu: false,
  orders: false,
  restaurants: false,
};

/**
 * What one person has done.
 *
 * A dialog off each row of the People directory, the same shape the order
 * board's History is — a feed is something you open about somebody, read, and
 * close, not a second thing to keep on screen while working down a list.
 *
 * It reads `GET /staff/{id}/activity`, which merges `audit_log` with
 * `order_events` and applies the caller's reach to both. So this component never
 * decides what somebody may see, and a feed that looks short is a statement
 * about reach rather than about the person.
 */
export function ActivityDialog({
  person,
  links = NO_ACTIVITY_LINKS,
}: {
  person: StaffListEntry;
  links?: ActivityLinks;
}) {
  const { language, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Nothing is fetched until it is opened, and the feed is dropped when it
    // closes: a list of twenty people would otherwise be twenty requests for
    // panels nobody looked at, and reopening must not show a timeline held from
    // the last time — this is read to check something current.
    if (!open) {
      setEntries(null);
      setTotal(0);
      setError(null);
      setPage(1);
      return;
    }

    let live = true;
    setEntries(null);
    api
      .activity(person.id, page)
      .then((result) => {
        if (!live) {
          return;
        }
        setEntries(result.items);
        setTotal(result.total);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!live) {
          return;
        }
        setEntries([]);
        setTotal(0);
        setError(errorText(t, err, 'errorLoadActivity'));
      });

    return () => {
      live = false;
    };
  }, [open, person.id, page, t]);

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={t('activityOf', { name: person.name })}
      // Wide, because an entry is a sentence with a place and a time after it.
      // At the default width every second row wraps.
      wide
      trigger={
        <Button icon="history" size="sm" aria-label={t('peopleOpenActivity', { name: person.name })}>
          {t('activityTitle')}
        </Button>
      }
    >
      <DialogBody>
        {error !== null && <Banner>{error}</Banner>}

        {entries === null ? (
          <Skeleton count={4} height={56} />
        ) : entries.length === 0 && error === null ? (
          <EmptyState
            icon="history"
            title={t('activityEmptyTitle')}
            description={t('activityNoneYetDesc')}
          />
        ) : (
          <>
          <ol className="timeline">
            {entries.map((entry) => (
              <li key={`${entry.kind}:${entry.id}`} className="timeline__entry">
                <span className="timeline__mark" aria-hidden="true" />
                <div className="timeline__body">
                  <div className="row spread">
                    <span className="timeline__what">{headline(t, entry, language)}</span>
                    <time className="timeline__at" dateTime={entry.at}>
                      {formatDateTime(entry.at, language)}
                    </time>
                  </div>

                  <p className="timeline__who">
                    <Where entry={entry} links={links} />
                    {entry.impersonatedBy !== null && (
                      <span className="timeline__acting">
                        {' · '}
                        {t('activityImpersonatedBy', {
                          name: entry.impersonatedBy.name ?? '',
                        })}
                      </span>
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <Pagination
            page={page}
            pageSize={ACTIVITY_PAGE_SIZE}
            total={total}
            onPage={setPage}
            labels={{
              nav: t('pagerLabel'),
              previous: t('pagerPrevious'),
              next: t('pagerNext'),
              page: (n) => t('pagerPage', { page: n }),
              range: t('pagerRange', {
                from: (page - 1) * ACTIVITY_PAGE_SIZE + 1,
                to: Math.min(page * ACTIVITY_PAGE_SIZE, total),
                total,
              }),
            }}
          />
          </>
        )}
      </DialogBody>
    </Dialog>
  );
}

/**
 * What an entry is about, and where it happened — each a link when there is
 * somewhere to go.
 *
 * The line reads `subject · place`, and the two halves lead to different
 * screens: the subject is the thing that was acted on, the place is the branch
 * it belongs to. Keeping the destination of each half the same on every row is
 * the point. The place used to carry the dish link on menu rows, which meant
 * "Dolmama · Northern Ave" opened a branch on one entry and a dish on the next.
 *
 * The subject repeats a name the sentence above already used, and that is worth
 * it: a link is a thing you point at, so it has to be its own word rather than a
 * span inside a translated sentence — the alternative is markup in a dictionary
 * that translators edit. The order code was already repeated this way before any
 * of it was clickable.
 *
 * The restaurant is named alongside the branch for the same reason it is in the
 * roles list: three restaurants have a "Northern Ave", and a branch name alone
 * is a room with no address. A platform action names no restaurant at all, and
 * says so rather than rendering an empty line.
 */
function Where({ entry, links }: { entry: ActivityEntry; links: ActivityLinks }) {
  const { language, t } = useLanguage();
  const { restaurantName, branchName } = entry.where;

  const place =
    restaurantName === null
      ? t('activityWherePlatform')
      : branchName === null
        ? restaurantName
        : `${restaurantName} · ${branchName}`;

  const placeTo = placeHref(entry, links);
  const where =
    placeTo === null ? (
      place
    ) : (
      <Link to={placeTo} className="link-where" title={t('activityOpenWhere', { where: place })}>
        {place}
      </Link>
    );

  const name = subjectName(t, entry, language);
  if (name === null) {
    return <>{where}</>;
  }

  const subjectTo = subjectHref(entry, links);
  return (
    <>
      {subjectTo === null ? (
        <span className="strong">{name}</span>
      ) : (
        <Link
          to={subjectTo}
          className="timeline__who-link"
          // The tooltip, not the accessible name: what a screen reader should
          // read out is the dish or the order, which is what the text already
          // says — and a page whose list of links is fifteen "Open this dish on
          // the menu" is a page nobody can navigate by link.
          title={entry.kind === 'order' ? t('activityOpenOrder') : t('activityOpenDish')}
        >
          {name}
        </Link>
      )}
      {' · '}
      {where}
    </>
  );
}

/**
 * What the entry is about, as a word — or null when it is about the place
 * itself and naming it twice would be the same word on both sides of the dot.
 *
 * That is every branch entry (`entity` is the branch the place already names),
 * and every staff, invite and booking one, none of which the panel has a screen
 * for. It leaves the two the feed is actually read for: dishes and orders.
 */
export function subjectName(
  t: Translate,
  entry: ActivityEntry,
  language: Language,
): string | null {
  if (entry.kind === 'order') {
    return entry.orderCode;
  }
  if (entry.entity !== AuditEntity.MenuItem) {
    return null;
  }
  // The name as it was at the time, which is `before` on every menu action but
  // the creation — the same choice `headline` makes, and for the same reason: on
  // a rename the old name is the one that makes the entry make sense.
  const named = entry.before?.nameI18n === undefined ? entry.after : entry.before;
  return dishName(t, named ?? {}, language);
}

/**
 * Where the place half leads, or null when it leads nowhere.
 *
 * The branch on the Restaurants screen — the same address a role in the
 * directory below links to, so the branch somebody opens from an entry is the
 * one they open from a role. A restaurant-wide action opens the restaurant with
 * its branches closed, because that is the scope the action was taken at.
 *
 * Null for a platform action, which happened over no restaurant and so has
 * nothing to open, and for an account that cannot open the screen at all.
 */
export function placeHref(entry: ActivityEntry, links: ActivityLinks): string | null {
  const { restaurantId, branchId } = entry.where;
  if (!links.restaurants || restaurantId === null) {
    return null;
  }
  return routePath({
    tab: 'Restaurants',
    open: { restaurantId, branchId, assignmentId: null },
  });
}

/**
 * Where the subject half leads, or null when it leads nowhere.
 *
 * A dish goes to its row on the branch's menu — "what did that price become" is
 * the next question after reading that it changed — and the branch is required
 * rather than optional, because a menu belongs to one and a dish id alone names
 * no page. Except the entry that took it off: a deleted dish is filtered out of
 * every menu read, so that link would open the right menu with nothing marked
 * on it, which reads as a broken link rather than as an answer. Its name stays
 * text, which is the honest version of "this is not there any more".
 *
 * An order goes to the board, scoped to its branch and narrowed to the one
 * order. That address is new: the board used to be addressable by branch only,
 * so this link would have landed somewhere near the answer rather than on it.
 * The code travels rather than the id because the board searches by code — and
 * because a code is the thing a person reads off the entry and recognises on
 * the card it lands on.
 */
export function subjectHref(entry: ActivityEntry, links: ActivityLinks): string | null {
  const { restaurantId, branchId } = entry.where;

  if (entry.kind === 'order') {
    return links.orders
      ? routePath({
          tab: 'Orders',
          scope: { restaurantId, branchId, orderCode: entry.orderCode },
        })
      : null;
  }

  return links.menu &&
    entry.entity === AuditEntity.MenuItem &&
    entry.action !== AuditAction.MenuItemDelete &&
    entry.entityId !== null &&
    branchId !== null
    ? routePath({ tab: 'Menu', menu: { branchId, itemId: entry.entityId } })
    : null;
}

/**
 * One entry as a sentence.
 *
 * Exported for its own test: this is the half of the panel with actual
 * reasoning in it, and every branch here is a row somebody will one day read in
 * a dispute. A wrong sentence is worse than a missing one.
 */
export function headline(t: Translate, entry: ActivityEntry, language: Language): string {
  if (entry.kind === 'order') {
    switch (entry.type) {
      case OrderEventType.Created:
        return t('activity_order_created', { code: entry.orderCode });
      case OrderEventType.Payment:
        return t('activity_order_payment', { code: entry.orderCode });
      default:
        return t('activity_order_status', {
          code: entry.orderCode,
          status: entry.toStatus === null ? '' : t(`orderStatus_${entry.toStatus}`),
        });
    }
  }

  const before = entry.before ?? {};
  const after = entry.after ?? {};
  // The dish's name is stored on the entry rather than looked up, because the
  // row it describes may be gone — and, for a rename, because the name it had
  // when it was edited is the one that makes the entry make sense.
  const dish = dishName(t, before, language);

  switch (entry.action) {
    case AuditAction.MenuItemCreate:
      return t('activity_menu_item_create', { name: dishName(t, after, language) });

    case AuditAction.MenuItemUpdate:
      // A price change is the one edit worth spelling out in full: it is what
      // this feed gets opened for, and "edited Khorovats" hides exactly the
      // number somebody came to check.
      return typeof after.priceAmd === 'number' && typeof before.priceAmd === 'number'
        ? t('activity_menu_item_price', {
            name: dish,
            from: formatAmd(before.priceAmd),
            to: formatAmd(after.priceAmd),
          })
        : t('activity_menu_item_update', { name: dish });

    case AuditAction.MenuItemAvailability:
      return after.isAvailable === true
        ? t('activity_menu_item_availability_on', { name: dish })
        : t('activity_menu_item_availability_off', { name: dish });

    case AuditAction.MenuItemDelete:
      return t('activity_menu_item_delete', { name: dish });

    case AuditAction.RestaurantServices:
      // What the restaurant was left offering, not what moved. Turning table
      // service on withdraws the eat-in option with it, so "turned dine-in on"
      // would name half of a change whose other half is the one a guest would
      // notice.
      return t('activity_restaurant_services', {
        services: serviceList(t, Array.isArray(after.services) ? after.services.map(String) : []),
      });

    case AuditAction.BranchCreate:
      return t('activity_branch_create', { name: text(after.name) || '—' });

    case AuditAction.BranchUpdate:
      return t('activity_branch_update');

    case AuditAction.BranchStatus:
      // One action, three things it can say. `isOpen` wins when both moved:
      // opening the branch is the event, and the prep estimate that came with
      // it is a detail.
      if (after.isOpen === true) {
        return t('activity_branch_status_open');
      }
      if (after.isOpen === false) {
        return t('activity_branch_status_closed');
      }
      return typeof after.avgPrepMin === 'number'
        ? t('activity_branch_status_prep', { to: after.avgPrepMin })
        : t('activity_branch_update');

    case AuditAction.StaffInvite:
      return after.granted === true
        ? t('activity_staff_invite_granted', { email: text(after.email), role: role(t, after.role) })
        : t('activity_staff_invite', { email: text(after.email), role: role(t, after.role) });

    case AuditAction.StaffInviteRevoke:
      return t('activity_staff_invite_revoke', { email: text(before.email) });

    case AuditAction.StaffAssignmentRevoke:
      return t('activity_staff_assignment_revoke', {
        role: role(t, before.role),
        name: text(before.name) || text(before.email),
      });

    case AuditAction.StaffImpersonate:
      return t('activity_staff_impersonate', { email: text(after.email) });

    case AuditAction.CustomerPhoneView:
      // The masked number, which is what the API records — the entry says which
      // number was read without being a second, permanent, readable copy of it.
      // The diner is not named: the feed is a record of what staff did, and
      // spelling out whose number it was on every row would turn an audit trail
      // into a list of customers somebody has looked up.
      return t('activity_customer_phone_view', { phone: text(after.phone) });

    case AuditAction.ReservationStatus:
      return t('activity_reservation_status', { status: reservationStatus(t, after.status) });

    case AuditAction.ReservationTable:
      // Numbers, not ids — which is why the API records them that way. "Moved
      // from 4 to 11" is readable a year later; a pair of UUIDs is not.
      return t('activity_reservation_table', {
        from: text(before.tableNo) || '—',
        to: text(after.tableNo) || '—',
      });

    case AuditAction.TableCreate:
      return t('activity_table_create', { table: text(after.tableNo) });

    case AuditAction.TableUpdate:
      return t('activity_table_update', { table: text(before.tableNo) });

    case AuditAction.TableDelete:
      return t('activity_table_delete', { table: text(before.tableNo) });

    case AuditAction.BranchBookingHours:
      // Null in `after` is the branch handing the question back to its opening
      // hours — a different event from writing hours that happen to match them,
      // and the one somebody would come looking for.
      return after.bookingHours === null
        ? t('activity_booking_hours_follow')
        : t('activity_booking_hours');

    case AuditAction.BranchClosureCreate:
      return t('activity_closure_create', { date: text(after.date) });

    case AuditAction.BranchClosureDelete:
      return t('activity_closure_delete', { date: text(before.date) });

    case AuditAction.BookingPolicy:
      return t('activity_booking_policy');

    default:
      // An action the API records and this build has no sentence for — a panel
      // deployed behind the API. Showing the raw verb is ugly and honest; the
      // alternative is an entry that silently disappears from an audit trail.
      return t('activityUnknown', { action: entry.action });
  }
}

/** A dish's stored `*_i18n` name in the panel's language, or a placeholder — the
 *  entry is still worth showing when the name was never recorded. */
function dishName(t: Translate, fields: Record<string, unknown>, language: Language): string {
  const raw = fields.nameI18n;
  if (raw === null || typeof raw !== 'object') {
    return t('activityUnnamedDish');
  }
  return pickLabel(raw as Record<string, string>, language) || t('activityUnnamedDish');
}

/**
 * A role name, translated.
 *
 * Checked against the enum rather than cast, because these values come out of a
 * JSON column: a row written by an older build can name a role this one no
 * longer has, and `t()` on a key that does not exist renders the key. Falling
 * back to the raw value keeps the entry readable and keeps the panel honest
 * about what was actually recorded.
 */
function role(t: Translate, value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return isRole(value) ? t(`staffRole_${value}`) : value;
}

function isRole(value: string): value is StaffRole {
  return (Object.values(StaffRole) as string[]).includes(value);
}

/** The same, for a booking's status. */
function reservationStatus(t: Translate, value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return (Object.values(ReservationStatus) as string[]).includes(value)
    ? t(`reservationStatus_${value as ReservationStatus}`)
    : value;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
