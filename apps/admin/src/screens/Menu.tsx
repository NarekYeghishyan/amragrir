import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MenuTab } from '@amragrir/shared';
import { api, errorText, type StaffBranch, type StaffMenuItem } from '../api';
import { EditDish, NewDish } from '../dish-form';
import { useLanguage } from '../i18n';
import type { Translate } from '../language';
import { formatAmd, pickLabel } from '../format';
import { MenuHistoryDialog } from '../menu-history';
import { routePath, type MenuTarget } from '../navigation';
import { navigate } from '../router';
import { branchesOf, firstBranchOf, restaurantsOf } from '../scope';
import {
  Badge,
  Banner,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  IconButton,
  PageHeader,
  SearchInput,
  SegmentedTabs,
  Select,
  Skeleton,
  Switch,
  TextInput,
  Toolbar,
  Tooltip,
  useToast,
} from '../ui';

type TabFilter = MenuTab | 'all';

export function Menu({
  branches,
  canWrite,
  canOpenStaff = false,
  target = null,
}: {
  branches: StaffBranch[];
  canWrite: boolean;
  /**
   * Whether a name in a dish's history is a link to the person.
   *
   * `staff:read`, which `menu:read` does not imply — a shift can see who
   * changed a price without being able to open the directory that person is in,
   * and a link to a tab the sidebar does not show is a dead end. The same idea
   * as the order board's `links`, and the API decides regardless of what the
   * panel renders.
   */
  canOpenStaff?: boolean;
  /**
   * Which branch's menu the address names, and which dish on it somebody was
   * sent to, or null for the menu this screen would pick for itself.
   *
   * From the URL rather than from state here, which is what makes a dish
   * something to link to: every line of an order on the board goes to
   * `/menu?branch=:id&dish=:id`, and "what is in this, how long does it take,
   * is it still on" is the next question after reading a ticket.
   */
  target?: MenuTarget | null;
}) {
  const { language, t } = useLanguage();
  /** The branch the address names, or none. */
  const wanted = target?.branchId ?? null;

  // Which menu this is, as a branch: the one the address names, or the first in
  // reach when it names none. Restaurant first and then its branches — a flat
  // list of every branch with the restaurant as a grey hint under each was fine
  // for an account holding two; at a dozen it is a list you read rather than a
  // choice you make, and two branches called "Northern Ave" from different
  // restaurants are told apart only by the small print.
  //
  // Seeded into state below rather than adopted a frame later by the effect, so
  // a menu opened on a dish fetches that branch once instead of fetching the
  // default and then correcting itself.
  const landed = useMemo(
    () => (wanted === null ? branches[0] : branches.find((branch) => branch.id === wanted)),
    [branches, wanted],
  );

  // The address names a branch this account cannot reach — a link from an
  // account whose reach is wider than this one's. Told apart from "names none"
  // so the screen can say so, and so that nothing is fetched or adopted in the
  // meantime: showing a different branch's menu under a URL that asked for this
  // one would be worse than showing none.
  const unreachable = wanted !== null && landed === undefined;
  const [restaurantId, setRestaurantId] = useState(landed?.restaurantId ?? '');
  const [branchId, setBranchId] = useState(landed?.id ?? '');
  const [items, setItems] = useState<StaffMenuItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<TabFilter>('all');
  const [adding, setAdding] = useState(false);
  /**
   * The dish whose form is open, or none.
   *
   * Here rather than a dialog per row: fifty rows would otherwise each hold a
   * form's worth of state and an upload hook for a dish nobody is editing. The
   * row hands over the item it already has, so the form opens filled in without
   * a request of its own.
   */
  const [editing, setEditing] = useState<StaffMenuItem | null>(null);
  const toast = useToast();

  const load = useCallback(
    async (id: string) => {
      if (!id) {
        setItems([]);
        return;
      }
      try {
        const page = await api.menu(id);
        setItems(page.items);
        setError(null);
      } catch (err) {
        setItems([]);
        setError(errorText(t, err, 'errorLoadMenu'));
      }
    },
    [t],
  );

  useEffect(() => {
    void load(branchId);
  }, [branchId, load]);

  // The address changing under a menu that is already up: the back button, a
  // second dish followed from the board in the same tab, or one of the pickers
  // below, which move by navigating. All of them arrive here, so there is one
  // path from "what the URL says" to "which menu is on screen" rather than two
  // that can disagree.
  useEffect(() => {
    if (landed === undefined) {
      return;
    }
    setRestaurantId(landed.restaurantId);
    setBranchId(landed.id);
  }, [landed]);

  const act = async (id: string, action: () => Promise<unknown>, done: string): Promise<void> => {
    setBusyId(id);
    try {
      await action();
      await load(branchId);
      toast.success(done);
    } catch (err) {
      // The delete-vs-ordered rule surfaces here as a 409 telling the owner to
      // mark the dish unavailable instead — worth showing verbatim.
      toast.error(errorText(t, err, 'errorSave'));
    } finally {
      setBusyId(null);
    }
  };

  const countIn = (list: StaffMenuItem[], filter: TabFilter): number =>
    filter === 'all' ? list.length : list.filter((item) => item.menuTab === filter).length;

  // Derived from the branches rather than fetched: every restaurant that owns
  // one is in here, and one that owns none has no menu to edit.
  const restaurants = useMemo(() => restaurantsOf(branches), [branches]);
  const branchOptions = useMemo(
    () => branchesOf(branches, restaurantId),
    [branches, restaurantId],
  );

  /**
   * Show a branch's menu.
   *
   * A navigation rather than a `setBranchId`, because which menu is on screen
   * *is* the address now: whoever flips to a branch and copies the URL out of
   * the bar should be sending the menu they are looking at. `replace`, so the
   * back button leaves for wherever they came from instead of walking back
   * through every branch they flipped through on the way.
   *
   * The dish is dropped on the way: a mark on a row of another branch's menu
   * is a mark on a row that is no longer there.
   */
  const showMenuOf = (nextBranchId: string): void => {
    navigate(
      routePath({
        tab: 'Menu',
        menu: nextBranchId === '' ? null : { branchId: nextBranchId, itemId: null },
      }),
      { replace: true },
    );
  };

  const pickRestaurant = (next: string): void => {
    // Land on one of its branches rather than clearing the choice. Unlike the
    // order board, "all branches" is not a state this screen has — a menu
    // belongs to a branch — so an empty selection would just be a blank page
    // waiting for a second click.
    showMenuOf(firstBranchOf(branches, next));
  };

  // The API hands back every language for these because they are editable, so
  // the panel picks the one it is currently set to.
  const nameOf = (item: StaffMenuItem): string => pickLabel(item.nameI18n, language);

  const all = items ?? [];
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return all.filter(
      (item) =>
        (tab === 'all' || item.menuTab === tab) &&
        (needle === '' || pickLabel(item.nameI18n, language).toLowerCase().includes(needle)),
    );
  }, [all, tab, query, language]);

  /** The dish the address came for — marked on its row, and brought into view
   *  once the menu holding it has landed. Null on a branch this account cannot
   *  reach, where there is no menu to mark it on. */
  const markItemId = unreachable ? null : (target?.itemId ?? null);

  /** The dish already scrolled to. Held rather than a plain "done" flag so that
   *  a second link followed in the same tab is answered too, and so that a
   *  later render — a price saved, a switch flipped — does not drag the page
   *  back to a row somebody has since scrolled away from. */
  const scrolledTo = useRef<string | null>(null);

  // Runs when the menu lands rather than on a timer: the row does not exist
  // until then, and `items` changing is precisely that arrival.
  useEffect(() => {
    if (markItemId === null || scrolledTo.current === markItemId) {
      return;
    }
    // On this menu, but behind a filter set before the link was followed — the
    // back button onto a screen that stayed mounted. Widening back out is the
    // answer: the address named a dish, and a filter is not a reply to that.
    const onThisMenu = all.some((item) => item.id === markItemId);
    if (onThisMenu && !shown.some((item) => item.id === markItemId)) {
      setTab('all');
      setQuery('');
      return;
    }
    const row = document.getElementById(`dish-${markItemId}`);
    if (row === null) {
      return;
    }
    scrolledTo.current = markItemId;
    row.scrollIntoView({ block: 'nearest' });
  }, [markItemId, all, shown]);

  if (branches.length === 0) {
    return (
      <section>
        <PageHeader title={t('menuTitle')} description={t('menuDesc')} />
        <EmptyState
          icon="restaurants"
          title={t('menuNoBranchesTitle')}
          description={t('menuNoBranchesDesc')}
        />
      </section>
    );
  }

  // A link from an account whose reach is wider than this one's — the branch is
  // real, it is simply not one this account can see. Said plainly rather than
  // quietly showing a different branch's menu: the address asked for a
  // particular one, and a menu is a list of prices somebody may act on. The way
  // out is the sidebar's own Menu link, which lands on a branch they do have.
  if (unreachable) {
    return (
      <section>
        <PageHeader title={t('menuTitle')} description={t('menuDesc')} />
        <EmptyState
          icon="menu"
          title={t('menuBranchUnreachableTitle')}
          description={t('menuBranchUnreachableDesc')}
        />
      </section>
    );
  }

  return (
    <section>
      <PageHeader
        title={t('menuTitle')}
        description={t('menuDesc')}
        actions={
          canWrite && (
            <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>
              {t('menuAddDish')}
            </Button>
          )
        }
      />

      {error !== null && <Banner>{error}</Banner>}

      <Toolbar>
        {/* Only when there is a choice to make. One restaurant is the common
            case, and a select holding a single option is furniture. */}
        {restaurants.length > 1 && (
          <Select
            value={restaurantId}
            onValueChange={pickRestaurant}
            ariaLabel={t('menuRestaurantLabel')}
            placeholder={t('menuRestaurantPlaceholder')}
            options={restaurants.map(([id, name]) => ({ value: id, label: name }))}
          />
        )}

        {/* Always shown, even holding one option: which branch this is the menu
            of is the context for every price and switch below it. */}
        <Select
          value={branchId}
          onValueChange={showMenuOf}
          ariaLabel={t('menuBranchLabel')}
          placeholder={t('menuBranchPlaceholder')}
          // No restaurant hint any more — it is the control above.
          options={branchOptions.map((branch) => ({
            value: branch.id,
            label: branch.name ?? branch.city,
          }))}
        />
        <SearchInput
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('menuFindDish')}
          aria-label={t('menuFindDish')}
        />
      </Toolbar>

      {items === null ? (
        <Skeleton count={5} height={56} />
      ) : (
        <SegmentedTabs
          value={tab}
          onValueChange={setTab}
          label={t('menuFilterLabel')}
          segments={[
            { value: 'all' as TabFilter, label: t('menuTabAll'), count: countIn(all, 'all') },
            ...Object.values(MenuTab).map((value) => ({
              value: value as TabFilter,
              label: t(`menuTab_${value}`),
              count: countIn(all, value),
            })),
          ]}
        >
          {shown.length === 0 ? (
            <EmptyState
              icon="menu"
              title={all.length === 0 ? t('menuEmptyTitle') : t('menuNoMatchTitle')}
              description={all.length === 0 ? t('menuEmptyDesc') : t('menuNoMatchDesc')}
              action={
                all.length === 0 &&
                canWrite && (
                  <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>
                    {t('menuEmptyAction')}
                  </Button>
                )
              }
            />
          ) : (
            <Card className="card--flush table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('menuColDish')}</th>
                    <th>{t('menuColTab')}</th>
                    <th className="table__num">{t('menuColPrice')}</th>
                    <th>{t('menuColAvailable')}</th>
                    {/* Always present now: History needs only `menu:read`, which
                        everybody looking at this screen holds. Delete is the
                        one action inside it that `menu:write` gates. */}
                    <th className="table__actions" />

                  </tr>
                </thead>
                <tbody>
                  {shown.map((item) => (
                    // Identified so that a line of an order on the board can
                    // send somebody straight to this row, and marked when it is
                    // the row they were sent to — a menu is fifty rows of
                    // similar text, and "it is in there somewhere" is not an
                    // answer to a link that knew which dish it meant.
                    <tr
                      key={item.id}
                      id={`dish-${item.id}`}
                      className={item.id === markItemId ? 'row--found' : undefined}
                      aria-current={item.id === markItemId ? true : undefined}
                      data-unavailable={!item.isAvailable || undefined}
                    >
                      <td>
                        {/* The picture, next to the name it belongs to. A menu
                            is what a customer looks at, and a panel that never
                            shows the photographs is one where a wrong or
                            missing one is invisible to everybody but them.
                            `alt=""` on purpose: the name is the next thing in
                            the row, and a screen reader announcing it twice
                            helps nobody. */}
                        <div className="dish">
                          {item.photoUrl === null ? (
                            <div className="dish__photo dish__photo--none" aria-hidden="true" />
                          ) : (
                            <img
                              className="dish__photo"
                              src={item.photoUrl}
                              alt=""
                              loading="lazy"
                            />
                          )}
                          <div>
                            <div className="strong">{nameOf(item)}</div>
                            <div className="faint">
                              {item.prepMin !== null && t('menuPrepMin', { minutes: item.prepMin })}
                              {item.prepMin !== null && item.dietaryTags.length > 0 && ' · '}
                              {item.dietaryTags.join(', ')}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <Badge>{t(`menuTab_${item.menuTab}`)}</Badge>
                      </td>
                      <td className="table__num">
                        {canWrite ? (
                          <PriceField
                            t={t}
                            item={item}
                            name={nameOf(item)}
                            disabled={busyId === item.id}
                            onSave={(priceAmd) =>
                              void act(
                                item.id,
                                () => api.updateMenuItem(item.id, { priceAmd }),
                                t('menuPriceUpdated'),
                              )
                            }
                          />
                        ) : (
                          formatAmd(item.priceAmd)
                        )}
                      </td>
                      <td>
                        {/* A shift may flip a dish sold out but not add one or
                            change a price — the API enforces the same split,
                            this only avoids offering it. */}
                        <Tooltip
                          label={
                            item.isAvailable ? t('menuAvailableOnTip') : t('menuAvailableOffTip')
                          }
                        >
                          <span className="row row--tight">
                            <Switch
                              checked={item.isAvailable}
                              disabled={busyId === item.id}
                              ariaLabel={t('menuAvailableSwitchLabel', { dish: nameOf(item) })}
                              onCheckedChange={(checked) =>
                                void act(
                                  item.id,
                                  () => api.setAvailability(item.id, checked),
                                  checked ? t('menuBackInStock') : t('menuMarkedSoldOut'),
                                )
                              }
                            />
                            <span className="faint">
                              {item.isAvailable ? t('menuAvailableYes') : t('menuAvailableNo')}
                            </span>
                          </span>
                        </Tooltip>
                      </td>
                      <td className="table__actions">
                        <span className="row row--tight row--end">
                          {/* Everything about the dish that a row cannot hold:
                              its photograph, its names in three languages, the
                              tab it sits under, the prep estimate. The price
                              and the sold-out switch stay in the row because
                              they are what somebody changes mid-shift without
                              wanting a form; this is for the rest. */}
                          {canWrite && (
                            <IconButton
                              icon="pencil"
                              label={t('menuEditLabel', { dish: nameOf(item) })}
                              disabled={busyId === item.id}
                              onClick={() => setEditing(item)}
                            />
                          )}
                          {/* Who put this dish here, who moved the price, who
                              marked it sold out. The row above can only say
                              what is true now — every cell in it is an UPDATE
                              that overwrote the previous answer. */}
                          <MenuHistoryDialog
                            itemId={item.id}
                            dish={nameOf(item)}
                            canOpenStaff={canOpenStaff}
                          />
                          {canWrite && (
                            <ConfirmDialog
                              title={t('menuDeleteTitle', { dish: nameOf(item) })}
                              description={t('menuDeleteDesc')}
                              confirmLabel={t('menuDeleteConfirm')}
                              busy={busyId === item.id}
                              onConfirm={() =>
                                void act(
                                  item.id,
                                  () => api.deleteMenuItem(item.id),
                                  t('menuDishDeleted'),
                                )
                              }
                              trigger={
                                <IconButton
                                  icon="trash"
                                  label={t('menuDeleteLabel', { dish: nameOf(item) })}
                                  disabled={busyId === item.id}
                                />
                              }
                            />
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </SegmentedTabs>
      )}

      {canWrite && (
        <NewDish
          branchId={branchId}
          open={adding}
          onOpenChange={setAdding}
          onCreated={() => {
            setAdding(false);
            void load(branchId);
          }}
        />
      )}

      {/* Mounted only while a dish is being edited, and keyed by that dish: the
          form is seeded from the row it opened on, so opening a second dish has
          to be a second form rather than the first one holding somebody else's
          price. */}
      {canWrite && editing !== null && (
        <EditDish
          key={editing.id}
          item={editing}
          onOpenChange={(open) => {
            if (!open) {
              setEditing(null);
            }
          }}
          onSaved={() => {
            setEditing(null);
            void load(branchId);
          }}
        />
      )}
    </section>
  );
}

/** Price is edited in place: changing one number should not be a form. */
function PriceField({
  t,
  item,
  name,
  disabled,
  onSave,
}: {
  t: Translate;
  item: StaffMenuItem;
  name: string;
  disabled: boolean;
  onSave: (priceAmd: number) => void;
}) {
  const [value, setValue] = useState(String(item.priceAmd));

  useEffect(() => {
    setValue(String(item.priceAmd));
  }, [item.priceAmd]);

  const dirty = value !== String(item.priceAmd);
  const parsed = Number(value);
  const valid = Number.isInteger(parsed) && parsed >= 0;

  return (
    <span className="row row--tight row--end">
      <TextInput
        className="input--num"
        inputMode="numeric"
        value={value}
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
        aria-label={t('menuPriceLabel', { dish: name })}
      />
      {dirty && (
        <Button variant="primary" size="sm" disabled={disabled || !valid} onClick={() => onSave(parsed)}>
          {t('actionSave')}
        </Button>
      )}
    </span>
  );
}

