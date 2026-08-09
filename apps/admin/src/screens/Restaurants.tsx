import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  RestaurantService,
  SERVICE_ORDER,
  StaffRole,
  serviceToggleBreach,
  toggleService,
} from '@amragrir/shared';
import {
  NO_RESTAURANT_FILTERS,
  RESTAURANTS_PAGE_SIZE,
  api,
  errorText,
  hasRestaurantFilters,
  type RestaurantFilters,
  type RestaurantPerson,
  type StaffBranch,
  type StaffRestaurant,
  type StaffRestaurantDetail,
} from '../api';
import { ActAsButton, type Acting } from '../acting';
import { useLanguage, useT } from '../i18n';
import type { Translate } from '../language';
import { routePath, tabPath, type RestaurantTarget } from '../navigation';
import { Link } from '../router';
import { branchesOf, restaurantsOf, showsBranchFilter } from '../scope';
import { PhotoField, usePhotoUpload } from '../photo';
import { SERVICE_HINT_KEYS, blockedReason, serviceList, serviceName } from '../services';
import {
  Badge,
  Banner,
  Button,
  Card,
  Dialog,
  DialogBody,
  DialogClose,
  DialogFooter,
  EmptyState,
  Field,
  Icon,
  PageHeader,
  Pagination,
  SearchInput,
  SectionTitle,
  Select,
  Skeleton,
  Switch,
  TextInput,
  Toolbar,
  Tooltip,
  useToast,
} from '../ui';

/** The "not narrowed" option, as a value Radix will accept — see Orders.tsx. */
const ANY = '*';

/** Long enough not to fire per character, short enough to feel like the box is
 *  doing it. Matches the order board. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Restaurants, each with its branches under it.
 *
 * Replaces a flat branch list, which could not represent a restaurant with **no
 * branches yet** — and that is precisely the restaurant somebody needs to find,
 * because it is the one waiting for a first branch. Grouping the flat list
 * client-side would have left those invisible, and the "add a branch" form
 * built its restaurant choices from that same list, so they were unreachable
 * as well as unseen.
 */
export function Restaurants({
  branches,
  canCreate,
  canEditRestaurant,
  canEditBranch,
  canReadStaff,
  canOpenOrders,
  open,
  acting = null,
}: {
  /** The shell's flat branch list — what the two pickers are built from. */
  branches: StaffBranch[];
  canCreate: boolean;
  /**
   * Whether each branch offers its own cover, services and bookings.
   *
   * `branch:write`, which a `restaurant_manager` holds — these are statements
   * about one address, so the person who answers for the address answers for
   * them. Distinct from `canEditRestaurant`, which is the *business's*
   * defaults.
   */
  canEditBranch: boolean;
  /**
   * Whether an opened restaurant can be *changed* here — its services offered
   * as switches rather than a line of text, and its cover photograph
   * replaceable.
   *
   * `restaurant:write`, which no branch-level role holds. Both are one
   * statement covering every branch of the business, which is exactly why a
   * `restaurant_manager` running one branch does not get either.
   */
  canEditRestaurant: boolean;
  /** Whether to ask who works at a restaurant when one is opened. A shift
   *  account reaches its branch without holding `staff:read`, and would get a
   *  403 where the section goes. */
  canReadStaff: boolean;
  /** Whether each branch offers the way to its own order queue. Gated on
   *  `orders:read`, which is what opens the board — every role that can see a
   *  branch holds it today, and a button to a screen the sidebar does not show
   *  would be a dead end the moment that stops being true. */
  canOpenOrders: boolean;
  /**
   * Which restaurant the address has open, and which of its branches opens with
   * it, or null for the list.
   *
   * From the URL rather than from state here, which is what makes an open
   * restaurant a thing that can be linked to: `/restaurants/:id` is somewhere a
   * colleague can be sent, and the back button leaves it the way it arrived.
   *
   * The filters, the search and the page number stay in state below. They
   * narrow the answer rather than being one, and they survive the trip into a
   * restaurant and back because this component is never unmounted to render the
   * detail — coming back lands where somebody left, with no refetch.
   */
  open: RestaurantTarget | null;
  /**
   * Signing in as somebody on one of the teams here, or null for an account
   * that may not — see `Acting` in `../acting`.
   *
   * Only the detail page uses it. The list shows restaurants and branches, not
   * the people on them, so there is nobody on it to act as.
   */
  acting?: Acting | null;
}) {
  const t = useT();
  const [restaurants, setRestaurants] = useState<StaffRestaurant[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<StaffRestaurant | null>(null);

  const [filters, setFilters] = useState<RestaurantFilters>(NO_RESTAURANT_FILTERS);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const toast = useToast();

  const load = useCallback(
    async (applied: RestaurantFilters, wanted: number) => {
      try {
        const result = await api.restaurants(applied, wanted);
        setRestaurants(result.items);
        setTotal(result.total);
        setError(null);
        // A page past the end of a narrowed list — land on one that exists
        // rather than showing nothing under a pager pointing into nothing.
        if (result.items.length === 0 && wanted > 1) {
          setPage(1);
        }
      } catch (err) {
        setRestaurants([]);
        setTotal(0);
        setError(errorText(t, err, 'errorLoadRestaurants'));
      }
    },
    [t],
  );

  // The search settles before it is applied — a request per keystroke on a
  // screen that returns whole restaurants is a lot of work to throw away.
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

  const narrow = (change: Partial<RestaurantFilters>): void => {
    setFilters((current) => ({ ...current, ...change }));
    // Any change to what is being looked at makes the current page number a
    // statement about a different list.
    setPage(1);
  };

  const clear = (): void => {
    setQuery('');
    setFilters(NO_RESTAURANT_FILTERS);
    setPage(1);
  };

  const restaurantOptions = useMemo(() => restaurantsOf(branches), [branches]);
  const branchOptions = useMemo(
    () => branchesOf(branches, filters.restaurantId),
    [branches, filters.restaurantId],
  );
  const filtered = hasRestaurantFilters(filters);

  const toggle = async (branch: StaffBranch, isOpen: boolean): Promise<void> => {
    setBusyId(branch.id);
    try {
      await api.setBranchStatus(branch.id, { isOpen });
      await load(filters, page);
      const name = branch.name ?? branch.city;
      toast.success(isOpen ? t('branchNowOpen', { branch: name }) : t('branchNowClosed', { branch: name }));
    } catch (err) {
      toast.error(errorText(t, err, 'errorUpdateBranch'));
    } finally {
      setBusyId(null);
    }
  };

  // One restaurant, opened. Rendered instead of the list rather than beside it,
  // so the filters and the page number are still there on the way back — the
  // list is not reloaded, and returning lands where somebody left.
  //
  // Keyed by the whole target, so that every distinct address is a fresh
  // arrival: the branch a link opens, the scroll that brings it into view and
  // the role it marks are all first-render work, and going from one restaurant
  // straight to another — which the back button and a pasted link now both
  // allow — would otherwise leave the previous arrival's state in place.
  if (open !== null) {
    return (
      <RestaurantDetail
        key={`${open.restaurantId}/${open.branchId ?? ''}/${open.assignmentId ?? ''}`}
        id={open.restaurantId}
        openBranchId={open.branchId}
        markAssignmentId={open.assignmentId}
        canCreate={canCreate}
        canEditRestaurant={canEditRestaurant}
        canEditBranch={canEditBranch}
        canReadStaff={canReadStaff}
        canOpenOrders={canOpenOrders}
        acting={acting}
      />
    );
  }

  return (
    <section>
      <PageHeader title={t('restaurantsTitle')} description={t('restaurantsDesc')} />

      {error !== null && <Banner>{error}</Banner>}

      {/* One box for both levels: whoever is typing knows whether they have a
          restaurant or a branch in mind, and does not want to pick a field
          first. The pickers underneath are for narrowing without typing. */}
      <Toolbar>
        <SearchInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('restaurantsSearch')}
          aria-label={t('restaurantsSearchHint')}
        />

        {restaurantOptions.length > 1 && (
          <Select
            value={filters.restaurantId || ANY}
            onValueChange={(value) =>
              // Changing restaurant drops the branch: the old one belongs to
              // the old restaurant, and together they match nothing.
              narrow({ restaurantId: value === ANY ? '' : value, branchId: '' })
            }
            ariaLabel={t('restaurantsAll')}
            options={[
              { value: ANY, label: t('restaurantsAll') },
              ...restaurantOptions.map(([id, name]) => ({ value: id, label: name })),
            ]}
          />
        )}

        {showsBranchFilter(filters.restaurantId, branchOptions.length) && (
          <Select
            value={filters.branchId || ANY}
            onValueChange={(value) => narrow({ branchId: value === ANY ? '' : value })}
            ariaLabel={t('restaurantsBranchAll')}
            options={[
              { value: ANY, label: t('restaurantsBranchAll') },
              ...branchOptions.map((branch) => ({
                value: branch.id,
                label: branch.name ?? branch.city,
                hint: filters.restaurantId === '' ? branch.restaurantName : undefined,
              })),
            ]}
          />
        )}

        {filtered && (
          <Button icon="close" onClick={clear}>
            {t('restaurantsFiltersClear')}
          </Button>
        )}
      </Toolbar>

      {restaurants === null ? (
        <Skeleton count={3} height={160} />
      ) : restaurants.length === 0 ? (
        <EmptyState
          icon="restaurants"
          title={filtered ? t('restaurantsNoMatchTitle') : t('restaurantsEmptyTitle')}
          description={filtered ? t('restaurantsNoMatchDesc') : t('restaurantsEmptyDesc')}
          action={
            filtered && (
              <Button icon="close" onClick={clear}>
                {t('restaurantsFiltersClear')}
              </Button>
            )
          }
        />
      ) : (
        <div className="stack">
          {restaurants.map((restaurant) => (
            <Card key={restaurant.id}>
              <div className="row spread">
                <div className="grow">
                  <div className="row row--tight">
                    {/* The name is the way in, not the whole card: a card
                        holding a switch and a link cannot also be one click
                        target without those becoming traps. A real anchor, so
                        the restaurant's address is on the status bar, in the
                        context menu, and open-in-new-tab away. */}
                    <Link
                      to={routePath({
                        tab: 'Restaurants',
                        open: {
                          restaurantId: restaurant.id,
                          branchId: null,
                          assignmentId: null,
                        },
                      })}
                      className="link-title"
                      aria-label={t('restaurantOpenLabel', { name: restaurant.name })}
                    >
                      {restaurant.name}
                      <Icon name="chevronRight" size={15} />
                    </Link>
                    {restaurant.reservationsEnabled && (
                      <Badge tone="accent">{t('restaurantTakesBookings')}</Badge>
                    )}
                  </div>
                  <div className="faint">
                    /{restaurant.slug}
                    {restaurant.cuisine !== null && ` · ${restaurant.cuisine}`} ·{' '}
                    {/* The restaurant's real count, not what a filter left on
                        screen — and when those differ, say so, or a search
                        turns a five-branch chain into "1 branch". */}
                    {restaurant.branches.length < restaurant.branchCount
                      ? t('branchCountFiltered', {
                          shown: restaurant.branches.length,
                          total: restaurant.branchCount,
                        })
                      : t.plural('branchCount', restaurant.branchCount)}
                  </div>
                </div>
                {canCreate && (
                  <Button
                    variant={restaurant.branchCount === 0 ? 'primary' : 'secondary'}
                    icon="plus"
                    onClick={() => setAddingTo(restaurant)}
                  >
                    {t('restaurantAddBranch')}
                  </Button>
                )}
              </div>

              {restaurant.branchCount === 0 ? (
                <p className="faint branches__none">
                  {canCreate ? t('branchesNoneCanCreate') : t('branchesNoneReadOnly')}
                </p>
              ) : (
                <div className="branches">
                  {restaurant.branches.map((branch) => (
                    <BranchRow
                      key={branch.id}
                      t={t}
                      branch={branch}
                      busy={busyId === branch.id}
                      canOpenOrders={canOpenOrders}
                      onToggle={(checked) => void toggle(branch, checked)}
                    />
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Pagination
        page={page}
        pageSize={RESTAURANTS_PAGE_SIZE}
        total={total}
        onPage={setPage}
        labels={{
          nav: t('pagerLabel'),
          previous: t('pagerPrevious'),
          next: t('pagerNext'),
          page: (n) => t('pagerPage', { page: n }),
          range: t('pagerRange', {
            from: (page - 1) * RESTAURANTS_PAGE_SIZE + 1,
            to: Math.min(page * RESTAURANTS_PAGE_SIZE, total),
            total,
          }),
        }}
      />

      {canCreate && (
        <NewBranch
          restaurant={addingTo}
          onOpenChange={(open) => {
            if (!open) {
              setAddingTo(null);
            }
          }}
          onCreated={() => {
            setAddingTo(null);
            void load(filters, page);
          }}
        />
      )}
    </section>
  );
}

/**
 * A team as the page has it.
 *
 * `undefined` — for a branch — means nobody has opened it, which is different
 * from an empty one: the first is a request not made, the second is a branch
 * with nobody on it, and only the second is worth saying out loud.
 */
type Team =
  | { status: 'loading' }
  | { status: 'ready'; people: RestaurantPerson[]; total: number }
  | { status: 'failed' };

/** What a branch row needs to open and show who works there. Absent on the
 *  restaurants list, and for an account without `staff:read`. */
interface Disclosure {
  open: boolean;
  onToggle: () => void;
  team: Team | undefined;
  /** The one role in it to mark, when a jump named one. */
  mark: string | null;
  /** Signing in as one of the people it discloses, or null for an account that
   *  may not. Part of showing who works here, so it travels with the rest. */
  acting: Acting | null;
}

/**
 * One branch, as it reads on the list and on a restaurant's own page.
 *
 * Extracted rather than written twice: the open/closed switch is the control
 * this screen exists for, and two copies of it are two places for the
 * disabled-while-saving state to drift.
 */
function BranchRow({
  t,
  branch,
  busy,
  canOpenOrders,
  onToggle,
  people,
  settings,
}: {
  t: Translate;
  branch: StaffBranch;
  busy: boolean;
  /** Whether to offer the way to this branch's queue — see `Restaurants`. */
  canOpenOrders: boolean;
  onToggle: (isOpen: boolean) => void;
  people?: Disclosure;
  /**
   * This branch's own cover, services and bookings, for an account that may
   * change them (`branch:write`).
   *
   * Behind the same disclosure as the team rather than always on: these are
   * three settings apiece, and a chain of forty branches would otherwise be a
   * page nobody can find a branch on. Passed as a node because the state and
   * the requests belong to the restaurant's page, which owns the branch list
   * this row is one of.
   */
  settings?: ReactNode;
}) {
  const name = branch.name ?? branch.city;
  const teamId = `team-${branch.id}`;
  // The name is a disclosure when there is anything under it — a team, this
  // branch's settings, or both. Without either it is plain text, as before.
  const opens = people !== undefined || settings !== undefined;

  return (
    // Identified so that a jump landing on this branch can scroll to it — the
    // seventh of ten branches is below the fold on arrival.
    //
    // Tinted while its team is disclosed, so an opened branch and the rows that
    // belong to it read as one block: the team is indented, but indentation
    // alone stops carrying in a chain of ten branches.
    <div
      className={people?.open ? 'branch branch--open' : 'branch'}
      id={`branch-${branch.id}`}
    >
      <div className="list-row">
        <div className="grow">
          {/* The name opens the team, when there is one to open — not the whole
              row, which holds a switch that would then be a trap. A button, so
              it is reachable by keyboard and announced as a disclosure. */}
          {!opens || people === undefined ? (
            <div className="strong">{name}</div>
          ) : (
            <button
              type="button"
              className="link-title link-title--disclosure"
              aria-expanded={people.open}
              aria-controls={teamId}
              onClick={people.onToggle}
            >
              {name}
              <Icon name={people.open ? 'chevronUp' : 'chevronDown'} size={15} />
            </button>
          )}
          <div className="faint">
            {branch.address ?? branch.city}
            {branch.avgPrepMin !== null && ` · ${t('branchPrep', { minutes: branch.avgPrepMin })}`} ·{' '}
            {t.plural('dishCount', branch.menuItemCount)}
          </div>
        </div>

        {/* The branch's own queue, one click away.

            This screen is where somebody works out *which* branch they mean —
            the chain, the address, whether it is even open — and the answer to
            that was previously good for nothing but reading: getting to its
            orders meant the Orders tab and then setting the same two pickers
            again from memory. The link carries both, so the board arrives
            already pointed at this branch.

            An anchor, and the scope is in its address rather than in a click
            handler, so it behaves like the rest of the panel: hover shows where
            it goes, ⌘-click opens the queue in a second tab beside the
            restaurant, and the URL that lands is one that can be sent on. */}
        {canOpenOrders && (
          <Link
            to={routePath({
              tab: 'Orders',
              scope: {
                restaurantId: branch.restaurantId,
                branchId: branch.id,
                // The whole queue: this button is about the branch, and an
                // order to single out is what an activity entry links with.
                orderCode: null,
              },
            })}
            className="btn btn--secondary btn--sm"
            aria-label={t('branchOrdersLabel', { branch: name })}
          >
            <Icon name="orders" size={15} />
            {t('branchOrdersAction')}
          </Link>
        )}

        <Tooltip
          label={
            branch.menuItemCount === 0
              ? t('branchNoMenuTip')
              : branch.isOpen
                ? t('branchOpenTip')
                : t('branchClosedTip')
          }
        >
          <span className="row row--tight">
            <Badge tone={branch.isOpen ? 'good' : 'neutral'} dot>
              {branch.isOpen ? t('branchAccepting') : t('branchClosed')}
            </Badge>
            <Switch
              checked={branch.isOpen}
              disabled={busy}
              ariaLabel={t('branchSwitchLabel', { branch: name })}
              onCheckedChange={onToggle}
            />
          </span>
        </Tooltip>
      </div>

      {/* Rendered whether or not it is open, and hidden rather than dropped: the
          button's `aria-controls` names this element, and a reference to an id
          that is not in the document is not a reference. Its contents still
          wait for the request, which waits for the click. */}
      {people !== undefined && (
        <div
          id={teamId}
          role="group"
          aria-label={t('branchTeamLabel', { branch: name })}
          className="team branch__team"
          hidden={!people.open}
        >
          {people.open && (
            <>
              {/* This branch's own answers first, then who works here. The
                  settings are what the person opening a branch came to change;
                  the team is who they would be telling about it. */}
              {settings}
              <RoleGroups
                team={people.team}
                empty={t('branchTeamEmpty')}
                mark={people.mark}
                acting={people.acting}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * What one branch answers for itself: its photograph, its services, its
 * bookings.
 *
 * Each has a **"this branch decides for itself" switch**, and that switch is
 * the data model rather than a nicety: the row stores "not answered" separately
 * from every answer, because a branch declaring exactly what the business
 * declares is a different state from one that has not declared — and only the
 * first survives the business changing its mind. With the switch off the
 * controls show the restaurant's values, disabled, so the screen still says
 * what this address offers rather than going blank.
 *
 * `offering` is what a guest sees and is what the controls reflect; `own` is
 * what this branch has stored, and decides only whether the switches are on.
 */
function BranchOffering({
  t,
  branch,
  saving,
  onCover,
  onServices,
  onBookings,
}: {
  t: Translate;
  branch: StaffBranch;
  saving: boolean;
  onCover: (coverUrl: string | null) => void;
  onServices: (services: string[] | null) => void;
  onBookings: (reservationsEnabled: boolean | null) => void;
}) {
  // The hook lives here rather than on the restaurant's page so each branch
  // gets its own file input: one shared hook holds one input ref, and with two
  // branches disclosed at once it would belong to whichever rendered last.
  const cover = usePhotoUpload((url) => onCover(url), api.uploadBranchCover);
  const ownServices = branch.own.servicesOverridden;
  const ownBookings = branch.own.reservationsEnabled !== null;

  return (
    <div className="branch__settings">
      <div className="branch__setting">
        <div className="row row--between">
          <span className="strong">{t('branchCoverTitle')}</span>
          {/* Only when there is one to give back. "Use the restaurant's" rather
              than "remove": the branch stops answering, it does not go blank. */}
          {branch.own.coverUrl !== null && !saving && (
            <Button variant="secondary" onClick={() => onCover(null)}>
              {t('branchUseRestaurant')}
            </Button>
          )}
        </div>
        <div className="cover">
          {branch.offering.coverUrl === null ? (
            <p className="faint cover__none">{t('restaurantCoverNone')}</p>
          ) : (
            <img
              className="cover__image"
              src={branch.offering.coverUrl}
              alt={t('restaurantCoverAlt')}
            />
          )}
          <div className="cover__actions">
            <PhotoField id={`branch-cover-${branch.id}`} url="" upload={cover} disabled={saving} />
            {saving && <span className="faint">{t('restaurantCoverSaving')}</span>}
            {branch.own.coverUrl === null && (
              <span className="faint">{t('branchFollowsRestaurant')}</span>
            )}
          </div>
        </div>
      </div>

      <div className="branch__setting">
        <div className="row row--between">
          <span className="strong">{t('restaurantDetailServices')}</span>
          <span className="row row--tight">
            <span className="faint">{t('branchDecidesItself')}</span>
            <Switch
              checked={ownServices}
              disabled={saving}
              ariaLabel={t('branchServicesOwnLabel', { branch: branch.name ?? branch.city })}
              // On: start from what it is already showing, so turning the
              // switch on changes nothing by itself — it only moves who decides.
              // Off: hand the question back.
              onCheckedChange={(on) => onServices(on ? [...branch.offering.services] : null)}
            />
          </span>
        </div>
        <ServiceRows
          t={t}
          services={branch.offering.services}
          reservationsEnabled={branch.offering.reservationsEnabled}
          saving={null}
          disabled={!ownServices || saving}
          onToggle={(service, on) =>
            onServices(toggleService(branch.offering.services, service, on))
          }
        />
      </div>

      <div className="branch__setting">
        <div className="row row--between">
          <span className="strong">{t('restaurantDetailBookings')}</span>
          <span className="row row--tight">
            <span className="faint">{t('branchDecidesItself')}</span>
            <Switch
              checked={ownBookings}
              disabled={saving}
              ariaLabel={t('branchBookingsOwnLabel', { branch: branch.name ?? branch.city })}
              onCheckedChange={(on) =>
                onBookings(on ? branch.offering.reservationsEnabled : null)
              }
            />
          </span>
        </div>
        <div className="row row--between">
          <span className="faint">
            {branch.offering.reservationsEnabled
              ? t('restaurantTakesBookings')
              : t('restaurantNoBookings')}
          </span>
          <Switch
            checked={branch.offering.reservationsEnabled}
            disabled={!ownBookings || saving}
            ariaLabel={t('branchBookingsLabel', { branch: branch.name ?? branch.city })}
            onCheckedChange={(on) => onBookings(on)}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * A team, grouped by role — the same rows under a restaurant's facts and
 * inside a branch.
 *
 * Grouped here rather than by the API: the rows arrive ordered by role already,
 * and one request is one scope's whole team, so there is no page boundary for a
 * group to straddle.
 */
function RoleGroups({
  team,
  empty,
  mark,
  acting,
}: {
  team: Team | undefined;
  /** What to say when the scope has nobody on it — the wording differs between
   *  a restaurant with no admin and a branch with no staff. */
  empty: string;
  /** The assignment a jump from the People screen came for, so the row somebody
   *  clicked is the row they see. Null on every team but the one holding it,
   *  and on every arrival that named nobody. */
  mark: string | null;
  /** Signing in as one of these people, or null for an account that may not. */
  acting: Acting | null;
}) {
  const { language, t } = useLanguage();

  if (team === undefined || team.status === 'loading') {
    return <Skeleton count={2} height={44} />;
  }
  if (team.status === 'failed') {
    return <p className="faint">{t('teamFailed')}</p>;
  }
  if (team.people.length === 0) {
    return <p className="faint">{empty}</p>;
  }

  const byRole = ROLE_ORDER.map(
    (role) => [role, team.people.filter((row) => row.role === role)] as const,
  ).filter(([, rows]) => rows.length > 0);

  return (
    <>
      {byRole.map(([role, rows]) => (
        <div key={role} className="team__group">
          <div className="row spread">
            <span className="strong">{t(`staffRoleGroup_${role}`)}</span>
            <Badge>{rows.length}</Badge>
          </div>
          {rows.map((row) => (
            // Identified and marked by *assignment*, not by person: somebody
            // managing two branches is two rows, and only one of them is the
            // one that was clicked. `aria-current`, because the tint is the
            // whole answer to "which one" and a tint is not read out.
            <div
              key={row.id}
              id={`role-${row.id}`}
              className={row.id === mark ? 'list-row role--found' : 'list-row'}
              aria-current={row.id === mark ? true : undefined}
            >
              <div className="grow">
                <div className="row row--tight">
                  <span className="strong">{row.person.name}</span>
                  {!row.person.isActive && <Badge tone="danger">{t('peopleDeactivated')}</Badge>}
                </div>
                <div className="faint">
                  {row.person.email} ·{' '}
                  {row.person.lastLoginAt === null
                    ? t('peopleNeverSignedIn')
                    : t('peopleLastIn', {
                        date: new Date(row.person.lastLoginAt).toLocaleDateString(language),
                      })}
                </div>
              </div>

              {/* The end of the row, as on a person's card in the directory.
                  `holdsARole` is true by construction here: this row **is** a
                  role, which is the one clause the two screens answer
                  differently. */}
              <ActAsButton
                person={{ ...row.person, holdsARole: true }}
                acting={acting}
              />
            </div>
          ))}
        </div>
      ))}

      {/* The API caps a team at fifty and there is no pager here, so a team past
          that has to say so rather than quietly stop. */}
      {team.total > team.people.length && (
        <p className="faint">{t('teamMore', { count: team.total - team.people.length })}</p>
      )}
    </>
  );
}

/**
 * How the restaurant will feed people, as switches.
 *
 * The rule this screen exists to hold: **table service and the eat-in pickup
 * option cancel each other out**. A room with waiters has no use for "collect
 * it at the counter and find a seat yourself", so whichever of the two is on,
 * the other cannot be — and rather than letting somebody turn it on and take a
 * refusal from the API, the switch is dead and the row says which switch to
 * turn off first.
 *
 * What decides that is `serviceToggleBreach`, the same function the API
 * validates with. Neither side restates the rule, which is what stops a panel
 * from offering a combination the API is about to refuse.
 *
 * There is no "take away" switch: it is what pickup *is*. Its absence is
 * explained in the row rather than left to be noticed.
 */
function ServiceRows({
  t,
  services,
  reservationsEnabled,
  saving,
  disabled = false,
  onToggle,
}: {
  t: Translate;
  services: string[];
  /** The resolved `reservations_enabled` for whatever this set belongs to — the
   *  restaurant's own, or a branch's, which may differ from its parent's. A
   *  second switch on the same thing; see the note in the row below. */
  reservationsEnabled: boolean;
  /** The service whose save is in flight, or null. Every switch waits for it —
   *  two overlapping saves would each send a whole set built from a state the
   *  other has already moved. */
  saving: RestaurantService | null;
  /**
   * Everything dead, whatever the rules say.
   *
   * Used by a branch that has not taken the services over: the switches then
   * show the restaurant's set, so the screen still says what this address
   * offers, but moving one would be answering a question this branch has not
   * claimed. Separate from `saving`, which is momentary.
   */
  disabled?: boolean;
  onToggle: (service: RestaurantService, on: boolean) => void;
}) {
  return (
    <div>
      {SERVICE_ORDER.map((service) => {
        const on = services.includes(service);
        const breach = serviceToggleBreach(services, service, !on);
        const name = serviceName(t, service);

        // Advertising bookings and taking them are two columns, and a booking
        // needs both (see `RestaurantReservationsService`). Nothing here can
        // set the second one, so the row says so rather than leaving somebody
        // to switch this on and wonder why no table can be booked.
        const hintKey =
          service === RestaurantService.Reserve && on && !reservationsEnabled
            ? 'restaurantServiceReserveOff'
            : SERVICE_HINT_KEYS[service];

        return (
          <div className="list-row" key={service}>
            <div className="grow">
              <div className="strong">{name}</div>
              {/* The reason wins the line when there is one: what a switch does
                  matters less than why it will not move. Both are plain text
                  rather than a tooltip — a tooltip is not there on a touch
                  screen, and this is the whole answer. */}
              {breach !== null ? (
                <div className="faint">{blockedReason(t, breach, service)}</div>
              ) : (
                hintKey !== undefined && <div className="faint">{t(hintKey)}</div>
              )}
            </div>

            <Switch
              checked={on}
              disabled={disabled || saving !== null || breach !== null}
              ariaLabel={t('restaurantServiceSwitchLabel', { service: name })}
              onCheckedChange={(checked) => onToggle(service, checked)}
            />
          </div>
        );
      })}
    </div>
  );
}

/** The order the roles read in — seniority, matching what the API sorts by. */
const ROLE_ORDER: readonly StaffRole[] = [
  StaffRole.SuperAdmin,
  StaffRole.PlatformAdmin,
  StaffRole.RestaurantAdmin,
  StaffRole.RestaurantManager,
  StaffRole.BranchStaff,
];

/**
 * One restaurant, opened from the list.
 *
 * The people arrive in their own requests, because they need their own
 * permission: `branch:read` opens the restaurant, `staff:read` says who works
 * there. A shift account holds the first and not the second, so they are asked
 * for only when they can be had — the alternative is a 403 rendered as a broken
 * section on a page that otherwise worked.
 *
 * And they arrive **where they are read**. The admins run the whole restaurant,
 * so they belong with the restaurant's own facts; everybody else works at one
 * branch, so they belong under that branch, fetched when it is opened. A chain
 * of forty branches would otherwise load thirty-nine teams nobody looked at,
 * and page them at fifty rows so that a branch's staff could land on page two,
 * away from the branch.
 */
function RestaurantDetail({
  id,
  openBranchId,
  markAssignmentId,
  canCreate,
  canEditRestaurant,
  canEditBranch,
  canReadStaff,
  canOpenOrders,
  acting,
}: {
  id: string;
  /** A branch to open on arrival — the one a jump from the People screen named.
   *  Null when the restaurant was opened from the list, or for a role held over
   *  the restaurant as a whole. */
  openBranchId: string | null;
  /** The role that jump came for, to mark once its team has arrived. Lives
   *  beside `openBranchId` rather than inside a team, because it is answered by
   *  the branch's team or by the restaurant's admins depending on which of the
   *  two the role is over. */
  markAssignmentId: string | null;
  canCreate: boolean;
  /** Whether the services are switches here rather than a line in the facts,
   *  and the cover can be replaced — see `Restaurants`. */
  canEditRestaurant: boolean;
  /** Whether each branch answers for itself — see `Restaurants`. */
  canEditBranch: boolean;
  canReadStaff: boolean;
  canOpenOrders: boolean;
  /** Signing in as one of the people on these teams, or null for an account
   *  that may not. */
  acting: Acting | null;
}) {
  const { language, t } = useLanguage();
  const [restaurant, setRestaurant] = useState<StaffRestaurantDetail | null>(null);
  const [admins, setAdmins] = useState<Team | undefined>(undefined);
  /** One branch's team, by branch id — absent until that branch is opened. */
  const [teams, setTeams] = useState<Record<string, Team>>({});
  const [open, setOpen] = useState<readonly string[]>(
    openBranchId === null ? [] : [openBranchId],
  );
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savingService, setSavingService] = useState<RestaurantService | null>(null);
  const [savingCover, setSavingCover] = useState(false);
  const [addingBranch, setAddingBranch] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      setRestaurant(await api.restaurant(id));
      setError(null);
    } catch (err) {
      setError(errorText(t, err, 'errorLoadRestaurants'));
    }
  }, [id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!canReadStaff) {
      return;
    }
    setAdmins({ status: 'loading' });
    void api
      .restaurantPeople(id)
      .then((page) => setAdmins({ status: 'ready', people: page.items, total: page.total }))
      // The restaurant is the page; who runs it is a line in one section of it.
      // A failure here says so in that section rather than taking down a screen
      // that answered the question it was opened for.
      .catch(() => setAdmins({ status: 'failed' }));
  }, [id, canReadStaff]);

  /**
   * Branch ids whose team has been asked for.
   *
   * A ref rather than a look at `teams`, which is a render behind: a branch
   * opened on arrival and the same branch clicked a moment later would
   * otherwise both find nothing there and ask twice.
   */
  const asked = useRef(new Set<string>());

  const showTeam = useCallback((branchId: string): void => {
    // Fetched once and kept. Closing a branch and opening it again is a
    // disclosure, not a refresh — and on a chain that is most of what happens.
    if (asked.current.has(branchId)) {
      return;
    }
    asked.current.add(branchId);

    setTeams((current) => ({ ...current, [branchId]: { status: 'loading' } }));
    void api
      .branchPeople(branchId)
      .then((page) =>
        setTeams((current) => ({
          ...current,
          [branchId]: { status: 'ready', people: page.items, total: page.total },
        })),
      )
      .catch(() => setTeams((current) => ({ ...current, [branchId]: { status: 'failed' } })));
  }, []);

  // A branch opened on arrival is already in `open`; only its team is missing,
  // and it is fetched through the same door a clicked one goes through.
  useEffect(() => {
    if (canReadStaff && openBranchId !== null) {
      showTeam(openBranchId);
    }
  }, [canReadStaff, openBranchId, showTeam]);

  /** Whether the arrival scroll has happened. Once, not once per render of the
   *  restaurant: `load` runs again after every switch is flipped, and yanking
   *  the page back to the branch somebody arrived at is not what flipping a
   *  switch three branches down asks for. */
  const scrolled = useRef(false);

  // Opening the branch is not enough on a chain — the seventh of ten is below
  // the fold, and a page that opened the right branch off screen has left the
  // hunting exactly where it was. `start`, so the branch's name is at the top
  // and its team reads down from there, whatever the team's height turns out
  // to be.
  useEffect(() => {
    if (openBranchId === null || restaurant === null || scrolled.current) {
      return;
    }
    scrolled.current = true;
    document.getElementById(`branch-${openBranchId}`)?.scrollIntoView({ block: 'start' });
  }, [openBranchId, restaurant]);

  /** Whether the marked role has been brought into view. Its own flag, because
   *  it happens later than the branch scroll and can happen without one. */
  const found = useRef(false);

  // The branch scroll above puts the branch's name at the top; the team is a
  // request behind it, and a branch with a dozen people can leave the row this
  // arrival is *about* below the fold — the hunting the jump exists to remove,
  // moved down one level. `nearest`, so a row already on screen stays exactly
  // where it is: this is a nudge for the rows that need one, not a second jump.
  //
  // Runs when the team lands rather than on a timer: the row does not exist
  // until then, and `teams`/`admins` changing is precisely that arrival.
  useEffect(() => {
    if (markAssignmentId === null || found.current) {
      return;
    }
    const row = document.getElementById(`role-${markAssignmentId}`);
    if (row === null) {
      return;
    }
    found.current = true;
    row.scrollIntoView({ block: 'nearest' });
  }, [markAssignmentId, teams, admins]);

  const toggleTeam = (branchId: string): void => {
    setOpen((current) =>
      current.includes(branchId)
        ? current.filter((each) => each !== branchId)
        : [...current, branchId],
    );
    showTeam(branchId);
  };

  const toggle = async (branch: StaffBranch, isOpen: boolean): Promise<void> => {
    setBusyId(branch.id);
    try {
      await api.setBranchStatus(branch.id, { isOpen });
      await load();
      const name = branch.name ?? branch.city;
      toast.success(isOpen ? t('branchNowOpen', { branch: name }) : t('branchNowClosed', { branch: name }));
    } catch (err) {
      toast.error(errorText(t, err, 'errorUpdateBranch'));
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Turns one service on or off, and stores what the whole set becomes.
   *
   * `toggleService` rather than adding to or removing from the array by hand,
   * because one switch is not always one change: turning pickup off takes the
   * eat-in option with it, since that option is a choice made *inside* pickup
   * and has nothing to attach to without it.
   *
   * The restaurant is replaced with what the API answers rather than with what
   * was sent, so the screen shows what was actually stored — including a
   * cascade the click did not spell out.
   */
  const flipService = async (service: RestaurantService, on: boolean): Promise<void> => {
    if (restaurant === null) {
      return;
    }
    setSavingService(service);
    try {
      const updated = await api.setRestaurantServices(
        restaurant.id,
        toggleService(restaurant.services, service, on),
      );
      setRestaurant(updated);
      const name = serviceName(t, service);
      toast.success(
        on ? t('restaurantServiceOn', { service: name }) : t('restaurantServiceOff', { service: name }),
      );
    } catch (err) {
      toast.error(errorText(t, err, 'errorUpdateServices'));
    } finally {
      setSavingService(null);
    }
  };

  // `restaurant:write`, not `menu:write` — a cover is not a dish, and a panel
  // asking the wrong endpoint would 403 at the moment somebody picks a file
  // rather than never offering the control at all.
  //
  // Unlike a dish, there is no form to submit afterwards: the restaurant
  // already exists, so the upload's answer goes straight on to it.
  const coverUpload = usePhotoUpload(
    (url) => void applyCover(url),
    api.uploadRestaurantCover,
  );

  /**
   * One branch's own cover, services or bookings.
   *
   * All three go through here because they are the same shape of thing: a
   * request that answers with the branch, and a list that has to be replaced
   * with what came back rather than with what was sent — a branch handing its
   * services back to the business is a change to what it *offers*, and only the
   * response knows what that resolved to.
   *
   * `busyBranchId` holds every control on that branch, so two overlapping saves
   * cannot each send a set built from a state the other has already moved.
   */
  const applyToBranch = async (
    branchId: string,
    save: () => Promise<StaffBranch>,
    fallback: 'errorUpdateCover' | 'errorUpdateServices' | 'errorUpdateBranch',
  ): Promise<void> => {
    setBusyId(branchId);
    try {
      const updated = await save();
      setRestaurant((current) =>
        current === null
          ? current
          : {
              ...current,
              branches: current.branches.map((each) => (each.id === branchId ? updated : each)),
            },
      );
    } catch (err) {
      toast.error(errorText(t, err, fallback));
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Puts a cover on the restaurant, or takes the one there down.
   *
   * The upload has already happened by the time this runs — `usePhotoUpload`
   * stores the file on choosing and hands back its URL — so this is only the
   * second half, the half that needs the restaurant's id. Storing what the API
   * answers rather than the URL that was sent keeps the page showing what is
   * actually on the row.
   *
   * A failed save leaves the previous cover on screen, which is the true one:
   * nothing was stored, and the toast is what says so.
   */
  const applyCover = async (coverUrl: string | null): Promise<void> => {
    if (restaurant === null) {
      return;
    }
    setSavingCover(true);
    try {
      setRestaurant(await api.setRestaurantCover(restaurant.id, coverUrl));
      toast.success(coverUrl === null ? t('restaurantCoverRemoved') : t('restaurantCoverSet'));
    } catch (err) {
      toast.error(errorText(t, err, 'errorUpdateCover'));
    } finally {
      setSavingCover(false);
      // The input keeps the chosen file otherwise, and choosing the same
      // picture again fires no `change` — so a retry after a failed save would
      // do nothing at all.
      coverUpload.clear();
    }
  };

  // The way back is the list's own address, so it behaves like the browser's
  // back button rather than only looking like it — and a restaurant opened
  // cold, from a pasted link with no history behind it, still has one.
  const back = (
    <Link to={tabPath('Restaurants')} className="btn btn--secondary">
      <Icon name="chevronLeft" size={16} />
      {t('restaurantBack')}
    </Link>
  );

  if (restaurant === null) {
    return (
      <section>
        <PageHeader title={t('restaurantsTitle')} actions={back} />
        {error !== null && <Banner>{error}</Banner>}
        {error === null && <Skeleton count={3} height={160} />}
      </section>
    );
  }

  return (
    <section>
      <PageHeader
        title={restaurant.name}
        description={`/${restaurant.slug}`}
        actions={
          <span className="row row--tight">
            {back}
            {canCreate && (
              <Button
                variant={restaurant.branchCount === 0 ? 'primary' : 'secondary'}
                icon="plus"
                onClick={() => setAddingBranch(true)}
              >
                {t('restaurantAddBranch')}
              </Button>
            )}
          </span>
        }
      />

      {error !== null && <Banner>{error}</Banner>}

      <SectionTitle>{t('restaurantDetailAbout')}</SectionTitle>
      <Card>
        <dl className="facts">
          <Fact label={t('restaurantDetailSlug')} value={`/${restaurant.slug}`} />
          <Fact
            label={t('restaurantDetailCuisine')}
            value={restaurant.cuisine ?? t('restaurantDetailNone')}
          />
          <Fact
            label={t('restaurantDetailPrice')}
            // The dram sign repeated, the way a price level is written
            // everywhere. Not a translated word: it means the same in all three
            // languages and reads at a glance.
            value={
              restaurant.priceLevel === null
                ? t('restaurantDetailNone')
                : '֏'.repeat(restaurant.priceLevel)
            }
          />
          <Fact
            label={t('restaurantDetailRating')}
            value={`${restaurant.ratingAvg.toFixed(1)} · ${t.plural('reviewCount', restaurant.reviewsCount)}`}
          />
          {/* A line of text for whoever may only read it. An account that can
              change the services gets the section below instead, rather than
              both — one place saying what is offered, and it is the one with
              the switches in it when there are switches. */}
          {!canEditRestaurant && (
            <Fact
              label={t('restaurantDetailServices')}
              value={serviceList(t, restaurant.services)}
            />
          )}
          <Fact
            label={t('restaurantDetailBookings')}
            value={
              restaurant.reservationsEnabled
                ? t('restaurantTakesBookings')
                : t('restaurantNoBookings')
            }
          />
          <Fact
            label={t('restaurantDetailCreated')}
            value={new Date(restaurant.createdAt).toLocaleDateString(language)}
          />
          <Fact
            label={t('restaurantDetailBranches')}
            value={t.plural('branchCount', restaurant.branchCount)}
          />
        </dl>

        {/* Who runs the place, with the facts about the place. An admin's role
            is held over the restaurant as a whole rather than any one branch,
            so this is the only section it belongs in — and it is the first
            thing anybody opening a restaurant wants to know. */}
        {canReadStaff && (
          <div className="team">
            <RoleGroups
              team={admins}
              empty={t('restaurantAdminsEmpty')}
              mark={markAssignmentId}
              acting={acting}
            />
          </div>
        )}
      </Card>

      {/* Directly under the facts, because it is one of them — what this
          restaurant looks like on a card, next to what it is called and what it
          cooks. Its own section rather than a row in the `<dl>` above only
          because a picture and a file input are not a labelled value.

          A small block, not a banner: this is here to answer "is there one, and
          is it the right photograph", which a thumbnail answers as well as a
          full-width crop would — and a hero image at the top of the page would
          push the branches, which is what somebody usually came for, below the
          fold. Shown to everyone who can open the restaurant, since a cover is
          public the moment it is set; the controls are for whoever may change
          it. */}
      <SectionTitle
        aside={
          canEditRestaurant ? <span className="faint">{t('restaurantCoverHint')}</span> : undefined
        }
      >
        {t('restaurantDetailCover')}
      </SectionTitle>
      {/* Since branches answer for themselves, this is the business's default
          rather than the answer — said once, here, so the section below is not
          read as "the picture every branch shows". */}
      <p className="faint section-note">{t('restaurantDefaultNote')}</p>
      <Card>
        <div className="cover">
          {restaurant.coverUrl === null ? (
            <p className="faint cover__none">{t('restaurantCoverNone')}</p>
          ) : (
            <img
              className="cover__image"
              src={restaurant.coverUrl}
              alt={t('restaurantCoverAlt')}
            />
          )}

          {canEditRestaurant && (
            <div className="cover__actions">
              <PhotoField
                id={`cover-${restaurant.id}`}
                // The picture is drawn beside this, at the size the section
                // shows it — passing it here too would render it twice.
                url=""
                upload={coverUpload}
                disabled={savingCover}
              />
              {savingCover && <span className="faint">{t('restaurantCoverSaving')}</span>}
              {/* Only when there is one to take down. Nothing else here can
                  send `null`, which is the API's way of clearing the column. */}
              {restaurant.coverUrl !== null && !savingCover && (
                <Button
                  variant="secondary"
                  icon="trash"
                  disabled={coverUpload.uploading}
                  onClick={() => void applyCover(null)}
                >
                  {t('restaurantCoverRemove')}
                </Button>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Its own section rather than a row in the facts above: these are four
          switches with a rule between them, and a `<dl>` of labelled values is
          the wrong shape for something you operate. */}
      {canEditRestaurant && (
        <>
          <SectionTitle aside={<span className="faint">{t('restaurantServicesHint')}</span>}>
            {t('restaurantDetailServices')}
          </SectionTitle>
          <p className="faint section-note">{t('restaurantDefaultNote')}</p>
          <Card>
            <ServiceRows
              t={t}
              services={restaurant.services}
              reservationsEnabled={restaurant.reservationsEnabled}
              saving={savingService}
              onToggle={(service, on) => void flipService(service, on)}
            />
          </Card>
        </>
      )}

      <SectionTitle
        aside={canReadStaff ? <span className="faint">{t('branchTeamHint')}</span> : undefined}
      >
        {t('restaurantDetailBranches')}
      </SectionTitle>
      {restaurant.branchCount === 0 ? (
        <Card>
          <p className="faint branches__none">
            {canCreate ? t('branchesNoneCanCreate') : t('branchesNoneReadOnly')}
          </p>
        </Card>
      ) : (
        <Card>
          <div className="branches">
            {restaurant.branches.map((branch) => (
              <BranchRow
                key={branch.id}
                t={t}
                branch={branch}
                busy={busyId === branch.id}
                canOpenOrders={canOpenOrders}
                onToggle={(checked) => void toggle(branch, checked)}
                people={
                  canReadStaff
                    ? {
                        open: open.includes(branch.id),
                        onToggle: () => toggleTeam(branch.id),
                        team: teams[branch.id],
                        mark: markAssignmentId,
                        acting,
                      }
                    : undefined
                }
                settings={
                  canEditBranch ? (
                    <BranchOffering
                      t={t}
                      branch={branch}
                      saving={busyId === branch.id}
                      onCover={(coverUrl) =>
                        void applyToBranch(
                          branch.id,
                          () => api.setBranchCover(branch.id, coverUrl),
                          'errorUpdateCover',
                        )
                      }
                      onServices={(services) =>
                        void applyToBranch(
                          branch.id,
                          () => api.setBranchServices(branch.id, services),
                          'errorUpdateServices',
                        )
                      }
                      onBookings={(reservationsEnabled) =>
                        void applyToBranch(
                          branch.id,
                          () => api.setBranchBookings(branch.id, reservationsEnabled),
                          'errorUpdateBranch',
                        )
                      }
                    />
                  ) : undefined
                }
              />
            ))}
          </div>
        </Card>
      )}

      {canCreate && (
        <NewBranch
          restaurant={addingBranch ? restaurant : null}
          onOpenChange={(open) => {
            if (!open) {
              setAddingBranch(false);
            }
          }}
          onCreated={() => {
            setAddingBranch(false);
            void load();
          }}
        />
      )}
    </section>
  );
}

/** One label/value pair in the facts list. A `<dl>` because that is what a list
 *  of labelled values is, and a screen reader reads the pairing. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="facts__row">
      <dt className="faint">{label}</dt>
      <dd className="strong">{value}</dd>
    </div>
  );
}

/** A new branch opens closed — it has no menu yet, and one that starts taking
 *  orders is a kitchen selling nothing. */
function NewBranch({
  restaurant,
  onOpenChange,
  onCreated,
}: {
  restaurant: StaffRestaurant | null;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const t = useT();
  const toast = useToast();

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (restaurant === null) {
      return;
    }
    setBusy(true);
    void api
      .createBranch({
        restaurantId: restaurant.id,
        name: name || undefined,
        address: address || undefined,
      })
      .then(() => {
        toast.success(
          t('newBranchCreated', {
            branch: name || t('newBranchFallbackName'),
            restaurant: restaurant.name,
          }),
        );
        setName('');
        setAddress('');
        onCreated();
      })
      .catch((err: unknown) => {
        toast.error(errorText(t, err, 'errorCreateBranch'));
      })
      .finally(() => setBusy(false));
  };

  return (
    <Dialog
      open={restaurant !== null}
      onOpenChange={onOpenChange}
      title={t('newBranchTitle')}
      description={
        restaurant === null
          ? undefined
          : t('newBranchDesc', { restaurant: restaurant.name })
      }
    >
      <form onSubmit={submit}>
        <DialogBody>
          <Field label={t('newBranchName')} hint={t('newBranchNameHint')}>
            {(id) => (
              <TextInput
                id={id}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('newBranchNamePlaceholder')}
                autoFocus
              />
            )}
          </Field>
          <Field label={t('newBranchAddress')}>
            {(id) => (
              <TextInput
                id={id}
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder={t('newBranchAddressPlaceholder')}
              />
            )}
          </Field>
        </DialogBody>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" disabled={busy}>
              {t('actionCancel')}
            </Button>
          </DialogClose>
          <Button type="submit" variant="primary" loading={busy}>
            {t('newBranchSubmit')}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
