import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { USERS_PAGE_SIZE, api, errorText, type AdminUser } from '../api';
import { CustomerOrdersDialog } from '../customer-orders';
import { useT } from '../i18n';
import { routePath } from '../navigation';
import { navigate } from '../router';
import {
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Pagination,
  SearchInput,
  Skeleton,
  Spinner,
  useToast,
} from '../ui';

/**
 * The **customer** list — people who order food.
 *
 * There is no role dropdown any more. Staff are separate accounts in their own
 * table, and the only way to create one is an invitation from the People tab;
 * a customer record can no longer be promoted into staff powers at all. That
 * removal is the point of the change, not a simplification of this screen.
 *
 * Read-only still, and two of its cells now open. A masked phone and an order
 * count are both facts with the answer withheld — the number is withheld on
 * purpose (see `revealed` below), the count was not: it said somebody had bought
 * eleven things and offered no way to see one of them.
 */
export function Users({
  person = null,
  canOpenOrders = false,
}: {
  /** One customer's id, from the address — a link that already knows who it
   *  means, such as a diner's name in an order's history. Null for the list. */
  person?: string | null;
  /** Whether an order inside the dialog is a link to itself on the Orders
   *  board. Gated on `orders:read`, which is what opens that screen — the same
   *  rule the order board's own history follows for its links out. Defaults to
   *  false, so a caller that says nothing offers no dead ends. */
  canOpenOrders?: boolean;
} = {}) {
  const t = useT();
  const toast = useToast();
  // The typed query and the applied one are separate. Paging has to repeat the
  // search that produced the list on screen, not whatever half-typed thing is
  // sitting in the box — clicking page 2 is not a way to run a new search.
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  // Bumped on every submit, so pressing Search with the term unchanged still
  // refetches. It is the only refresh this screen has.
  const [reload, setReload] = useState(0);

  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * The numbers somebody has asked to see, by customer id.
   *
   * The API masks every phone in the list and hands back a full one per account,
   * on request, writing an `audit_log` row each time — so this is a cache of
   * answers already paid for rather than data the screen was given. Cleared with
   * every load below: a page of revealed numbers surviving a search would mean
   * the mask lasted exactly until somebody typed something.
   */
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  /** Which reveal is in flight, so only that cell spins. */
  const [revealing, setRevealing] = useState<string | null>(null);

  const load = useCallback(
    async (term: string, wanted: number, only: string | null) => {
      setBusy(true);
      try {
        const result = await api.users(term || undefined, undefined, wanted, only ?? undefined);
        setUsers(result.items);
        setTotal(result.total);
        setRevealed({});
        setError(null);
        // The list shrank under a page that no longer exists — a narrower
        // search, or accounts removed since. Land on one that does rather than
        // showing an empty table with a pager pointing past the end.
        if (result.items.length === 0 && wanted > 1) {
          setPage(1);
        }
      } catch (err) {
        setUsers([]);
        setTotal(0);
        setRevealed({});
        setError(errorText(t, err, 'errorLoadCustomers'));
      } finally {
        setBusy(false);
      }
    },
    [t],
  );

  /**
   * Ask for one customer's number in full.
   *
   * One account, when somebody asks — never the page. The API records every
   * call, so a screen that fetched these with the list would write twenty-five
   * entries saying a number was read that nobody looked at, and the record would
   * stop meaning anything.
   *
   * A toast on failure rather than the banner at the top: the banner is about
   * the list, which is fine, and the thing that failed is one cell somebody just
   * clicked. Nothing is cached on failure, so clicking again retries.
   */
  const reveal = async (user: AdminUser): Promise<void> => {
    if (revealed[user.id] !== undefined || revealing !== null) {
      return;
    }
    setRevealing(user.id);
    try {
      const result = await api.userPhone(user.id);
      setRevealed((current) => ({ ...current, [user.id]: result.phone }));
    } catch (err) {
      toast.error(errorText(t, err, 'errorRevealPhone'));
    } finally {
      setRevealing(null);
    }
  };

  useEffect(() => {
    void load(search, page, person);
  }, [load, search, page, reload, person]);

  /** Back to every customer. The id is in the address, so leaving it is what
   *  clears it — dropping it from state alone would not survive a reload. */
  const clear = (): void => {
    setQuery('');
    setSearch('');
    setPage(1);
    navigate(routePath({ tab: 'Customers' }));
  };

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setSearch(query);
    // A new search is a new list; page 5 of the old one means nothing in it.
    setPage(1);
    setReload((count) => count + 1);
  };

  return (
    <section>
      <PageHeader title={t('customersTitle')} description={t('customersDesc')} />

      {error !== null && <Banner>{error}</Banner>}

      {/* A form, not a Toolbar: Enter in the search box has to submit, and a
          div cannot do that. Same strip, same class. */}
      <form className="toolbar" onSubmit={submit}>
        <SearchInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('customersSearchPlaceholder')}
          aria-label={t('customersSearchLabel')}
        />
        <Button type="submit" variant="primary" loading={busy}>
          {t('actionSearch')}
        </Button>

        {/* The one filter with nothing on screen to show it: the search box is
            empty, so a table of one row would otherwise look like a platform
            with one customer on it. */}
        {person !== null && (
          <>
            <Badge tone="accent">{t('customersOnePerson')}</Badge>
            <Button icon="close" onClick={clear}>
              {t('peopleFiltersClear')}
            </Button>
          </>
        )}
      </form>

      {users === null ? (
        <Skeleton count={6} height={52} />
      ) : users.length === 0 ? (
        <EmptyState
          icon="customers"
          title={
            search === '' && person === null ? t('customersEmptyTitle') : t('customersNoMatchTitle')
          }
          description={
            // An id that finds nobody is a deleted account, not a failed
            // search: it came from a link that knew who it meant, and this
            // screen sees every customer there is.
            person !== null
              ? t('customersGoneDesc')
              : search === ''
                ? t('customersEmptyDesc')
                : t('customersNoMatchDesc')
          }
          action={
            person !== null && (
              <Button icon="close" onClick={clear}>
                {t('peopleFiltersClear')}
              </Button>
            )
          }
        />
      ) : (
        <>
          <Card className="card--flush table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('customersColCustomer')}</th>
                  <th>{t('customersColContact')}</th>
                  {/* Centred, not ranged right: these are counts rather than
                      money, and the heading has to sit over its own numbers. */}
                  <th className="table__count">{t('customersColOrders')}</th>
                  <th className="table__count">{t('customersColPoints')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="strong">{user.name ?? t('customersNoName')}</td>
                    <td className="muted">
                      <Phone
                        masked={user.phone}
                        full={revealed[user.id]}
                        busy={revealing === user.id}
                        onReveal={() => void reveal(user)}
                        labels={{
                          none: t('customersNoPhone'),
                          reveal: t('customersRevealPhone', {
                            name: user.name ?? t('customersNoName'),
                          }),
                          revealed: t('customersPhoneRevealed'),
                        }}
                      />
                      {user.email !== null && ` · ${user.email}`}
                    </td>
                    <td className="table__count">
                      {/* The count is the control when there is something behind
                          it. A zero opens an empty dialog to say "none", which
                          is a click to be told what the cell already said. */}
                      {user.ordersCount === 0 ? (
                        <span className="muted">0</span>
                      ) : (
                        <CustomerOrdersDialog user={user} canOpenOrders={canOpenOrders} />
                      )}
                    </td>
                    <td className="table__count">{user.rewardPoints}</td>
                    <td className="table__actions">
                      <span className="row row--tight row--end">
                        {user.isGuest && <Badge>{t('customersGuest')}</Badge>}
                        {!user.phoneVerified && (
                          <Badge tone="warn">{t('customersUnverified')}</Badge>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Pagination
            page={page}
            pageSize={USERS_PAGE_SIZE}
            total={total}
            onPage={setPage}
            labels={{
              nav: t('pagerLabel'),
              previous: t('pagerPrevious'),
              next: t('pagerNext'),
              page: (n) => t('pagerPage', { page: n }),
              range: t('pagerRange', {
                from: (page - 1) * USERS_PAGE_SIZE + 1,
                to: Math.min(page * USERS_PAGE_SIZE, total),
                total,
              }),
            }}
          />
        </>
      )}
    </section>
  );
}

/**
 * A customer's phone number: masked, or in full once somebody has asked.
 *
 * The masked form is the API's, not a client-side blur — the panel is never sent
 * the digits it is not showing, so nothing about this cell is defeated by a
 * developer console. Asking is a request, and the API writes a row for each one.
 *
 * The masked number is a button; the revealed one is text. What can be done here
 * is done once and does not undo: hiding it again would offer to un-know
 * something, and the record of the reveal is already written either way. The
 * badge beside it says the number is showing rather than masked, so a cell being
 * read over somebody's shoulder cannot be mistaken for the ordinary state.
 *
 * An account with no number at all — a guest who never verified one — has
 * nothing to reveal and renders as the words the list has always used.
 */
function Phone({
  masked,
  full,
  busy,
  onReveal,
  labels,
}: {
  /** As the API sends it, or null for an account with no number. */
  masked: string | null;
  /** The full number, once fetched. Undefined until then. */
  full: string | undefined;
  busy: boolean;
  onReveal: () => void;
  labels: { none: string; reveal: string; revealed: string };
}) {
  if (masked === null) {
    return <>{labels.none}</>;
  }
  if (full !== undefined) {
    return (
      <>
        <span className="num">{full}</span>{' '}
        <Badge tone="warn">{labels.revealed}</Badge>
      </>
    );
  }
  return (
    <button
      type="button"
      className="link-reveal"
      // The tooltip and the accessible name both, because the visible text is a
      // row of asterisks: "+374******56" read out is not a control anyone can
      // identify, and this is the one control on the screen that hands out PII.
      title={labels.reveal}
      aria-label={labels.reveal}
      disabled={busy}
      onClick={onReveal}
    >
      <span className="num">{masked}</span>
      {busy && <Spinner />}
    </button>
  );
}
