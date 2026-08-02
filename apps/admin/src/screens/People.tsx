import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { StaffRole } from '@amragrir/shared';
import {
  INVITES_PAGE_SIZE,
  NO_PEOPLE_FILTERS,
  PEOPLE_PAGE_SIZE,
  api,
  errorText,
  hasPeopleFilters,
  type PeopleFilters,
  type StaffAssignment,
  type StaffBranch,
  type StaffInvite,
  type StaffListEntry,
} from '../api';
import { ActAsButton, type Acting } from '../acting';
import { ActivityDialog, NO_ACTIVITY_LINKS, type ActivityLinks } from '../activity';
import { useLanguage, useT } from '../i18n';
import { routePath, targetOf } from '../navigation';
import { Link, navigate } from '../router';
import {
  Badge,
  Banner,
  Button,
  Card,
  ConfirmDialog,
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
  Skeleton,
  TextInput,
  Select,
  Toolbar,
  useToast,
} from '../ui';

/** The "every role" option, as a value Radix will accept — see Orders.tsx. */
const ANY = '*';

/** Long enough not to fire per character, short enough to feel like the box is
 *  doing it. Matches the order board and the restaurants list. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Who works here.
 *
 * Everything on this screen is scoped by the API to the caller's own reach: a
 * restaurant admin sees their own people, not the platform's. The panel does
 * not filter anything itself — the search, the role and both page numbers go
 * to the API, so a count and a page are statements about the whole directory
 * rather than about the slice that happened to be fetched.
 */
export function People({
  canInvite,
  canReadActivity = false,
  canOpenRestaurants = false,
  activityLinks = NO_ACTIVITY_LINKS,
  person = null,
  acting = null,
}: {
  canInvite: boolean;
  /** Whether this account holds `staff:activity`. False leaves the card without
   *  its Activity button rather than offering to open something the API is
   *  about to refuse. */
  canReadActivity?: boolean;
  /** Whether the place a role is held over is somewhere this account can go.
   *  False for one that cannot open the Restaurants screen at all, which leaves
   *  those rows as the text they were. */
  canOpenRestaurants?: boolean;
  /** Which of the screens an activity entry names this account can open — see
   *  `ActivityLinks`. Passed through rather than derived here: this screen is
   *  handed what it may offer, it does not read permissions itself. */
  activityLinks?: ActivityLinks;
  /** One person's id, from the address — a link that already knows who it
   *  means, such as a name in an order's history. Null for the directory.
   *
   *  The API decides whether it resolves to anybody: an id outside this
   *  account's reach narrows the list to nothing rather than reaching past it,
   *  which is why an empty answer here says "not somebody you can see" instead
   *  of "no such person". */
  person?: string | null;
  /** Signing in as somebody here, or null for an account that may not — see
   *  `Acting` in `../acting`. */
  acting?: Acting | null;
}) {
  const { language, t } = useLanguage();
  const [staff, setStaff] = useState<StaffListEntry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [invites, setInvites] = useState<StaffInvite[]>([]);
  const [inviteTotal, setInviteTotal] = useState(0);
  const [branches, setBranches] = useState<StaffBranch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  const [filters, setFilters] = useState<PeopleFilters>({
    ...NO_PEOPLE_FILTERS,
    personId: person ?? '',
  });
  const [query, setQuery] = useState('');
  // Two lists, two page numbers. They are filtered together and walked
  // separately: reaching page 3 of the directory says nothing about which
  // invitations somebody wants to see.
  const [page, setPage] = useState(1);
  const [invitePage, setInvitePage] = useState(1);
  const toast = useToast();

  const load = useCallback(
    async (applied: PeopleFilters, wanted: number, wantedInvites: number) => {
      try {
        const [people, open] = await Promise.all([
          api.staff(applied, wanted),
          api.invites(applied, wantedInvites),
        ]);
        setStaff(people.items);
        setTotal(people.total);
        setInvites(open.items);
        setInviteTotal(open.total);
        setError(null);
        // A page past the end of a narrowed list — land on one that exists
        // rather than showing nothing under a pager pointing into nothing.
        if (people.items.length === 0 && wanted > 1) {
          setPage(1);
        }
        if (open.items.length === 0 && wantedInvites > 1) {
          setInvitePage(1);
        }
      } catch (err) {
        setStaff([]);
        setTotal(0);
        setInvites([]);
        setInviteTotal(0);
        setError(errorText(t, err, 'errorLoadStaff'));
      }
    },
    [t],
  );

  // The invite dialog's pickers, fetched once. Which branches exist does not
  // depend on a filter or a page, and `load` now runs on every settled
  // keystroke — asking for them again each time would be a request per search.
  useEffect(() => {
    void api
      .branches()
      .then((result) => setBranches(result.items))
      .catch(() => setBranches([]));
  }, []);

  // The search settles before it is applied. Every keystroke reaching the API
  // would be two requests per character.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const term = query.trim();
      setFilters((current) => (current.q === term ? current : { ...current, q: term }));
      setPage(1);
      setInvitePage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  // The address is what says which person, and it can change under a screen
  // that is already mounted — a link followed from the order board, or the back
  // button off one. Reading it into the filters here rather than only at mount
  // is what makes the second link somebody clicks work like the first.
  useEffect(() => {
    const wanted = person ?? '';
    setFilters((current) =>
      current.personId === wanted ? current : { ...current, personId: wanted },
    );
    setPage(1);
  }, [person]);

  useEffect(() => {
    void load(filters, page, invitePage);
  }, [load, filters, page, invitePage]);

  const narrow = (change: Partial<PeopleFilters>): void => {
    setFilters((current) => ({ ...current, ...change }));
    // Any change to what is being looked at makes both page numbers statements
    // about a different list.
    setPage(1);
    setInvitePage(1);
  };

  const clear = (): void => {
    setQuery('');
    setFilters(NO_PEOPLE_FILTERS);
    setPage(1);
    setInvitePage(1);
    // One of the filters lives in the address. Dropping it from state alone
    // would last until the next read of the URL put it straight back — and
    // would leave a link somebody could reload into the filter they just
    // cleared.
    if (person !== null) {
      navigate(routePath({ tab: 'People' }));
    }
  };

  const filtered = hasPeopleFilters(filters);

  const act = async (id: string, action: () => Promise<unknown>, done: string): Promise<void> => {
    setBusyId(id);
    try {
      await action();
      await load(filters, page, invitePage);
      toast.success(done);
    } catch (err) {
      toast.error(errorText(t, err, 'errorSave'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section>
      <PageHeader
        title={t('peopleTitle')}
        description={t('peopleDesc')}
        actions={
          canInvite && (
            <Button variant="primary" icon="plus" onClick={() => setInviting(true)}>
              {t('peopleInvite')}
            </Button>
          )
        }
      />

      {error !== null && <Banner>{error}</Banner>}

      {/* One box over the three things a card shows — a name, an email, and
          where somebody works — because whoever is typing knows which of them
          they remember and should not have to pick a field first. The role
          picker is the narrowing that needs no typing. */}
      <Toolbar>
        <SearchInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('peopleSearch')}
          aria-label={t('peopleSearchHint')}
        />

        <Select
          value={filters.role || ANY}
          onValueChange={(value) => narrow({ role: value === ANY ? '' : (value as StaffRole) })}
          ariaLabel={t('peopleRoleAll')}
          options={[
            { value: ANY, label: t('peopleRoleAll') },
            ...Object.values(StaffRole).map((role) => ({
              value: role,
              label: t(`staffRole_${role}`),
            })),
          ]}
        />

        {/* Said out loud, because this is the one filter with nothing on screen
            to show it: the search box is empty and the role picker says "All
            roles", so a directory of one would otherwise look like a directory
            with one person left in it. */}
        {filters.personId !== '' && <Badge tone="accent">{t('peopleOnePerson')}</Badge>}

        {filtered && (
          <Button icon="close" onClick={clear}>
            {t('peopleFiltersClear')}
          </Button>
        )}
      </Toolbar>

      {/* Hidden while the screen is pointed at one person: an invitation has no
          staff account to be that person, so every one of them would be an
          answer to a question nobody asked. */}
      {invites.length > 0 && filters.personId === '' && (
        <>
          <SectionTitle aside={<span className="faint">{t('peopleInvitesNotAccepted')}</span>}>
            {t('peopleInvitesWaiting')}
          </SectionTitle>
          <Card>
            {invites.map((invite) => (
              <div key={invite.id} className="list-row">
                <div className="grow">
                  <div className="row row--tight">
                    <Icon name="mail" size={15} />
                    <span className="strong">{invite.email}</span>
                  </div>
                  <div className="faint">
                    {t(`staffRole_${invite.role}`)} ·{' '}
                    {t('peopleInviteExpires', {
                      date: new Date(invite.expiresAt).toLocaleDateString(language),
                    })}
                  </div>
                </div>
                {canInvite && (
                  <ConfirmDialog
                    title={t('peopleWithdrawTitle', { email: invite.email })}
                    description={t('peopleWithdrawDesc')}
                    confirmLabel={t('peopleWithdraw')}
                    busy={busyId === invite.id}
                    onConfirm={() =>
                      void act(
                        invite.id,
                        () => api.revokeInvite(invite.id),
                        t('peopleInviteWithdrawn'),
                      )
                    }
                    trigger={
                      <Button variant="danger" size="sm" disabled={busyId === invite.id}>
                        {t('peopleWithdraw')}
                      </Button>
                    }
                  />
                )}
              </div>
            ))}
          </Card>

          {/* Renders nothing under ten, which is nearly always. It is here so
              that the eleventh open invitation is reachable rather than
              quietly dropped off the end of the section. */}
          <Pagination
            page={invitePage}
            pageSize={INVITES_PAGE_SIZE}
            total={inviteTotal}
            onPage={setInvitePage}
            labels={{
              nav: t('pagerLabel'),
              previous: t('pagerPrevious'),
              next: t('pagerNext'),
              page: (n) => t('pagerPage', { page: n }),
              range: t('pagerRange', {
                from: (invitePage - 1) * INVITES_PAGE_SIZE + 1,
                to: Math.min(invitePage * INVITES_PAGE_SIZE, inviteTotal),
                total: inviteTotal,
              }),
            }}
          />
        </>
      )}

      {staff !== null && staff.length > 0 && <SectionTitle>{t('peopleStaff')}</SectionTitle>}

      {staff === null ? (
        <Skeleton count={3} height={120} />
      ) : staff.length === 0 ? (
        // "Nobody works here" and "nobody matches that" are different facts,
        // and offering to invite the first person in answer to a failed search
        // answers a question nobody asked.
        <EmptyState
          icon="people"
          title={filtered ? t('peopleNoMatchTitle') : t('peopleEmptyTitle')}
          description={
            // A person asked for by id and not found is not a failed search:
            // the id came from a link that knew who it meant, so the answer is
            // that they work somewhere this account cannot see. Saying "nobody
            // matches those filters" would read as a broken link.
            filters.personId !== ''
              ? t('peopleNotInReachDesc')
              : filtered
                ? t('peopleNoMatchDesc')
                : t('peopleEmptyDesc')
          }
          action={
            filtered ? (
              <Button icon="close" onClick={clear}>
                {t('peopleFiltersClear')}
              </Button>
            ) : (
              canInvite && (
                <Button variant="primary" icon="plus" onClick={() => setInviting(true)}>
                  {t('peopleEmptyAction')}
                </Button>
              )
            )
          }
        />
      ) : (
        <div className="stack">
          {staff.map((person) => (
            <Card key={person.id}>
              <div className="row spread">
                <div className="grow">
                  <div className="row row--tight">
                    <span className="strong">{person.name}</span>
                    {!person.isActive && <Badge tone="danger">{t('peopleDeactivated')}</Badge>}
                  </div>
                  <div className="faint">
                    {person.email} ·{' '}
                    {person.lastLoginAt === null
                      ? t('peopleNeverSignedIn')
                      : t('peopleLastIn', {
                          date: new Date(person.lastLoginAt).toLocaleDateString(language),
                        })}
                  </div>
                </div>

                {/* The corner of the card, opposite the name they are about.
                    Both render nothing where they would not work, so the rules
                    live in one place rather than once per screen offering them. */}
                <div className="row row--tight">
                  {canReadActivity && <ActivityDialog person={person} links={activityLinks} />}
                  <ActAsButton
                    person={{ ...person, holdsARole: person.assignments.length > 0 }}
                    acting={acting}
                  />
                </div>
              </div>

              <div className="branches">
                {person.assignments.length === 0 && (
                  <p className="faint">{t('peopleNoRoles')}</p>
                )}
                {person.assignments.map((assignment) => (
                  <div key={assignment.id} className="list-row">
                    <div className="grow row row--tight">
                      <Badge tone="accent">{t(`staffRole_${assignment.role}`)}</Badge>
                      <Whereabouts assignment={assignment} canOpen={canOpenRestaurants} />
                    </div>
                    <ConfirmDialog
                      title={t('peopleRemoveTitle', {
                        role: t(`staffRole_${assignment.role}`),
                        name: person.name,
                      })}
                      description={t('peopleRemoveDesc')}
                      confirmLabel={t('peopleRemoveConfirm')}
                      busy={busyId === assignment.id}
                      onConfirm={() =>
                        void act(
                          assignment.id,
                          () => api.revokeAssignment(assignment.id),
                          t('peopleRoleRemoved'),
                        )
                      }
                      trigger={
                        <Button variant="danger" size="sm" disabled={busyId === assignment.id}>
                          {t('peopleRemove')}
                        </Button>
                      }
                    />
                  </div>
                ))}
              </div>
            </Card>
          ))}

          <Pagination
            page={page}
            pageSize={PEOPLE_PAGE_SIZE}
            total={total}
            onPage={setPage}
            labels={{
              nav: t('pagerLabel'),
              previous: t('pagerPrevious'),
              next: t('pagerNext'),
              page: (n) => t('pagerPage', { page: n }),
              range: t('pagerRange', {
                from: (page - 1) * PEOPLE_PAGE_SIZE + 1,
                to: Math.min(page * PEOPLE_PAGE_SIZE, total),
                total,
              }),
            }}
          />
        </div>
      )}

      {canInvite && (
        <InviteDialog
          branches={branches}
          open={inviting}
          onOpenChange={setInviting}
          onInvited={() => {
            setInviting(false);
            void load(filters, page, invitePage);
          }}
        />
      )}
    </section>
  );
}

/**
 * Where a role is held — and the way there.
 *
 * The restaurant is named on every row, including a branch role's, because a
 * branch name on its own is a room with no chain attached: three restaurants
 * have a "Northern Ave". Clicking opens that restaurant, on that branch when
 * the role is over one, which is the row somebody clicked — the alternative is
 * arriving at a chain of forty closed branches to look for it again.
 *
 * A platform role is over no restaurant and so has nowhere to go; it stays
 * text, as does every row when the account cannot open the Restaurants tab.
 */
function Whereabouts({
  assignment,
  canOpen,
}: {
  assignment: StaffAssignment;
  /** Whether the Restaurants screen is one this account can open at all. */
  canOpen: boolean;
}) {
  const t = useT();
  const target = targetOf(assignment);

  if (target === null || assignment.restaurantName === null) {
    return <span className="faint">{t('peopleWholePlatform')}</span>;
  }

  const where =
    assignment.branchName === null
      ? assignment.restaurantName
      : `${assignment.restaurantName} · ${assignment.branchName}`;

  if (!canOpen) {
    return <span className="faint">{where}</span>;
  }

  // The role's own address on the other screen — the restaurant, the branch it
  // is over, and the row to mark. Pasted into a message it takes whoever reads
  // it to the same row, which is the whole point of the jump.
  return (
    <Link
      to={routePath({ tab: 'Restaurants', open: target })}
      className="link-where"
      aria-label={t('peopleOpenWhere', { where })}
    >
      {where}
    </Link>
  );
}

/**
 * Inviting someone.
 *
 * The role decides which scope the form asks for, matching the CHECK
 * constraint on `staff_assignments`: a platform role takes neither, a
 * restaurant admin takes a restaurant, a manager or shift takes a branch.
 */
function InviteDialog({
  branches,
  open,
  onOpenChange,
  onInvited,
}: {
  branches: StaffBranch[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvited: () => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>(StaffRole.BranchStaff);
  const [scopeId, setScopeId] = useState('');
  const [busy, setBusy] = useState(false);
  const t = useT();
  const toast = useToast();

  const restaurants = [
    ...new Map(branches.map((branch) => [branch.restaurantId, branch.restaurantName])).entries(),
  ];
  const needs =
    role === StaffRole.SuperAdmin || role === StaffRole.PlatformAdmin
      ? 'nothing'
      : role === StaffRole.RestaurantAdmin
        ? 'restaurant'
        : 'branch';

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setBusy(true);
    void api
      .invite({
        email,
        role,
        ...(needs === 'restaurant' ? { restaurantId: scopeId } : {}),
        ...(needs === 'branch' ? { branchId: scopeId } : {}),
      })
      .then((response) => {
        // An account that already exists and can sign in gets the role
        // straight away — no "set your password" email it did not ask for.
        toast.success(
          response.granted
            ? t('inviteGranted', { email: response.email })
            : t('inviteSent', { email: response.email }),
        );
        setEmail('');
        setScopeId('');
        onInvited();
      })
      .catch((err: unknown) => {
        toast.error(errorText(t, err, 'errorSendInvite'));
      })
      .finally(() => setBusy(false));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('inviteTitle')}
      description={t('inviteDesc')}
    >
      <form onSubmit={submit}>
        <DialogBody>
          <Field label={t('inviteEmail')} required>
            {(id) => (
              <TextInput
                id={id}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t('inviteEmailPlaceholder')}
                autoFocus
              />
            )}
          </Field>

          <Field
            label={t('inviteRole')}
            // One key per scope rather than one sentence with the scope
            // interpolated: "restaurant" and "branch" would each need a case
            // Armenian and Russian inflect, and neither is a name to drop in.
            hint={
              needs === 'nothing'
                ? t('inviteScopeNone')
                : needs === 'restaurant'
                  ? t('inviteScopeRestaurant')
                  : t('inviteScopeBranch')
            }
          >
            {(id) => (
              <Select
                id={id}
                value={role}
                onValueChange={(next) => {
                  setRole(next);
                  // The old scope belongs to the old role's shape and would be
                  // rejected — or worse, accepted for the wrong thing.
                  setScopeId('');
                }}
                options={Object.values(StaffRole).map((value) => ({
                  value,
                  label: t(`staffRole_${value}`),
                }))}
              />
            )}
          </Field>

          {needs === 'restaurant' && (
            <Field label={t('inviteRestaurant')} required>
              {(id) => (
                <Select
                  id={id}
                  value={scopeId}
                  onValueChange={setScopeId}
                  placeholder={t('inviteRestaurantPlaceholder')}
                  options={restaurants.map(([restaurantId, name]) => ({
                    value: restaurantId,
                    label: name,
                  }))}
                />
              )}
            </Field>
          )}

          {needs === 'branch' && (
            <Field label={t('inviteBranch')} required>
              {(id) => (
                <Select
                  id={id}
                  value={scopeId}
                  onValueChange={setScopeId}
                  placeholder={t('inviteBranchPlaceholder')}
                  options={branches.map((branch) => ({
                    value: branch.id,
                    label: branch.name ?? branch.city,
                    hint: branch.restaurantName,
                  }))}
                />
              )}
            </Field>
          )}
        </DialogBody>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" disabled={busy}>
              {t('actionCancel')}
            </Button>
          </DialogClose>
          <Button
            type="submit"
            variant="primary"
            loading={busy}
            disabled={!email.includes('@') || (needs !== 'nothing' && scopeId === '')}
          >
            {t('inviteSubmit')}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
