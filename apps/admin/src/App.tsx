import { Fragment, useCallback, useEffect, useState } from 'react';
import { Language, Permission } from '@amragrir/shared';
import {
  ApiError,
  acting,
  api,
  errorText,
  tokens,
  type ActingAs,
  type StaffBranch,
  type StaffProfile,
} from './api';
import type { Acting } from './acting';
import { NotificationBell } from './notifications';
import { LanguageProvider, useLanguage, useT } from './i18n';
import { LANGUAGES, LANGUAGE_LABEL_KEYS } from './language';
import {
  SIGN_IN_PATH,
  TAB_GROUPS,
  activeTab,
  parseRoute,
  tabEntry,
  tabPath,
  visibleTabs,
  type Route,
} from './navigation';
import { Link, splitHref, navigate, useHref } from './router';
import { applyTheme, resolveTheme, type Theme } from './theme';
import {
  Banner,
  Button,
  EmptyState,
  Icon,
  Menu,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  Skeleton,
  ToastProvider,
  TooltipProvider,
} from './ui';
import { SignIn, modeFromUrl } from './screens/SignIn';
import { Orders } from './screens/Orders';
import { Menu as MenuScreen } from './screens/Menu';
import { Restaurants } from './screens/Restaurants';
import { Dashboard } from './screens/Dashboard';
import { Users } from './screens/Users';
import { People } from './screens/People';
import { Platform } from './screens/Platform';

/**
 * Every screen has an address.
 *
 * The panel used to hold the current tab in `useState`, which meant one URL for
 * seven screens: nothing could be bookmarked, linked to a colleague, opened in
 * a second tab, or come back from a browser's back button — and a reload always
 * landed on the order queue, whatever somebody had been reading. The URL is now
 * the state: `parseRoute` says what the address means, `routePath` writes one,
 * and this component renders whichever screen the address names.
 */
export function App() {
  // Outside everything, including the sign-in screen: a member of staff who
  // reads no English has to be able to switch before they can read the form
  // asking for their password.
  return (
    <LanguageProvider>
      <TooltipProvider>
        <ToastProvider>
          <Panel />
        </ToastProvider>
      </TooltipProvider>
    </LanguageProvider>
  );
}

function Panel() {
  const t = useT();
  const href = useHref();
  const { pathname, search } = splitHref(href);
  /** What the address bar is asking for, or null when it asks for nothing this
   *  panel has — a bare `/`, or a path somebody mistyped. */
  const route = parseRoute(pathname, search);

  const [signedIn, setSignedIn] = useState(tokens.access !== null);
  const [me, setMe] = useState<StaffProfile | null>(null);
  const [branches, setBranches] = useState<StaffBranch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Who this browser is acting as, or null for the account that signed in.
   *  Read from storage on mount so a reload does not quietly return a super
   *  admin to themselves while the token on the wire is still somebody else's. */
  const [actingAs, setActingAs] = useState<ActingAs | null>(() => acting.current());

  const signOut = useCallback(() => {
    // Back to their own tokens first, so the refresh token this revokes is a
    // real one — an impersonated session has none, and leaving the super
    // admin's alive on the server is worse than the extra step.
    if (acting.current() !== null) {
      acting.end();
      setActingAs(null);
    }
    const refresh = tokens.refresh;
    if (refresh) {
      // Best effort: the local session is gone either way, but telling the API
      // lets it drop the refresh token instead of leaving it valid for 30 days.
      void api.logout(refresh).catch(() => undefined);
    }
    tokens.clear();
    setMe(null);
    setSignedIn(false);
  }, []);

  const load = useCallback(async () => {
    try {
      // Read from the database rather than the token: a role granted a minute
      // ago is not in the current access token, and this decides the tabs.
      const profile = await api.me();
      setMe(profile);

      const page = profile.permissions.includes(Permission.BranchRead)
        ? await api.branches()
        : { items: [] };
      setBranches(page.items);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        // The stored token is gone, expired past refresh, or belongs to an
        // account whose roles have been revoked — whose sessions the API ends.
        // Either way this is a sign-in, not an error.
        signOut();
        return;
      }
      setError(errorText(t, err, 'errorLoadRestaurants'));
    }
  }, [signOut, t]);

  useEffect(() => {
    if (signedIn) {
      void load();
    }
  }, [signedIn, load]);

  // A signed-out browser on a panel address is sent to the sign-in form, which
  // keeps where it was going — a session that expires mid-shift should cost
  // whoever is on it a password, not their place.
  //
  // An address that is already a sign-in of some kind is left alone. Which ones
  // those are is `modeFromUrl`'s question, asked rather than answered a second
  // time here: an invitation carries a one-use token, and bouncing it to
  // `/sign-in` spends it on a screen with nowhere to type a new password.
  useEffect(() => {
    if (signedIn || pathname === SIGN_IN_PATH) {
      return;
    }
    if (modeFromUrl(pathname, search).mode !== 'signin') {
      return;
    }
    navigate(`${SIGN_IN_PATH}?next=${encodeURIComponent(href)}`, { replace: true });
  }, [signedIn, pathname, search, href]);

  /** The tab the address names, or null for an address that names none. */
  const wanted = route?.tab ?? null;

  // An address this account cannot open — a link to the platform dashboard sent
  // to a branch manager, a URL left over from a role since revoked, or one that
  // parses to nothing at all — lands on the first screen the account does have.
  //
  // Only once the profile has arrived. Permissions are unknown until then, and
  // redirecting on an empty set would rewrite the address bar before the panel
  // knows anything: a deep link opened cold would be gone before it was read.
  //
  // `replace`, so the back button goes where the person came from rather than
  // to the address that just bounced them.
  useEffect(() => {
    if (!signedIn || me === null) {
      return;
    }
    const visible = visibleTabs(me.permissions);
    const first = visible[0];
    if (first === undefined) {
      // An account holding no roles at all. There is no screen to send it to,
      // and the empty state below says so rather than a redirect loop.
      return;
    }
    if (wanted === null || !visible.includes(wanted)) {
      navigate(tabPath(first), { replace: true });
    }
  }, [signedIn, me, wanted]);

  /**
   * Become somebody else, and come back.
   *
   * Both ends do the same two things: swap which token storage holds, then
   * re-read the profile that decides the tabs. The screens themselves are
   * remounted by the `key` on `Shell` rather than asked to refetch — they each
   * hold a page of somebody's orders or people, and there is no version of
   * "keep what you have" that is right when the account changed underneath it.
   */
  const startActing = useCallback(
    (who: ActingAs, accessToken: string): void => {
      acting.begin(accessToken, who);
      setActingAs(who);
      void load();
    },
    [load],
  );

  const stopActing = useCallback((): void => {
    acting.end();
    setActingAs(null);
    void load();
  }, [load]);

  const signedInAt = useCallback((): void => {
    const next = new URLSearchParams(search).get('next');
    // Only ever a path of this panel's own. `next` arrives in the address bar,
    // where anyone can write it: a `//elsewhere.example` would be a link out of
    // the panel dressed up as a sign-in. A bare `/` is not a screen either, but
    // it is a route that means nothing, which the fallback above resolves into
    // the first screen this account can open.
    const to = next !== null && next.startsWith('/') && !next.startsWith('//') ? next : '/';
    navigate(to, { replace: true });
    setSignedIn(true);
  }, [search]);

  return signedIn ? (
    <Shell
      // Every screen below holds a page of somebody's data, fetched with the
      // token that was current when it mounted. Changing who that is remounts
      // all of them rather than leaving each to notice on its own.
      key={actingAs?.id ?? 'self'}
      me={me}
      branches={branches}
      error={error}
      route={route}
      actingAs={actingAs}
      onStopActing={stopActing}
      onStartActing={startActing}
      onSignOut={signOut}
    />
  ) : (
    <SignIn onSignedIn={signedInAt} />
  );
}

/**
 * The signed-in frame: a sidebar that says where you are, and one column of
 * content.
 *
 * A sidebar rather than the old strip of tabs above the page. Seven
 * destinations wrapped onto two lines at anything under a wide window, the
 * current one was a coloured pill among identical pills, and there was nowhere
 * to put the account. Down the side they are a fixed list that never reflows,
 * grouped by what they are about.
 */
function Shell({
  me,
  branches,
  error,
  route,
  actingAs,
  onStopActing,
  onStartActing,
  onSignOut,
}: {
  me: StaffProfile | null;
  branches: StaffBranch[] | null;
  error: string | null;
  /** What the address bar says, null when it says nothing this panel has. */
  route: Route | null;
  /** Who this session is acting as, or null for the account that signed in. */
  actingAs: ActingAs | null;
  onStopActing: () => void;
  onStartActing: (who: ActingAs, accessToken: string) => void;
  onSignOut: () => void;
}) {
  const t = useT();
  const can = (permission: Permission): boolean => me?.permissions.includes(permission) ?? false;
  const tabs = visibleTabs(me?.permissions ?? []);

  // Null is the "may not" case, which is every account without
  // `staff:impersonate` — and a super admin already acting as somebody, whatever
  // that account holds, because the API refuses to chain and a button that 403s
  // is worse than no button. Both screens that list people take this one object
  // rather than three flags to keep in step.
  const acting: Acting | null =
    can(Permission.StaffImpersonate) && actingAs === null
      ? { selfId: me?.id ?? null, begin: onStartActing }
      : null;
  // What to render *now*. The address is corrected by the effect in `Panel`,
  // which cannot run until after this paint — so for one frame the URL can name
  // a screen this account may not open, and falling back here is what stops
  // that frame from being a screen where every request 403s.
  const active = route === null ? (tabs[0] ?? null) : activeTab(route.tab, tabs);
  const isPlatform = can(Permission.PlatformMetrics);

  // Headings earn their space only when there is more than one group to tell
  // apart — a lone "Restaurant" label over the whole sidebar says nothing.
  const groups = TAB_GROUPS.map((group) => ({
    ...group,
    items: tabs.filter((name) => tabEntry(name).group === group.key),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            A
          </span>
          <span className="brand__text">
            <span className="brand__name">{t('brand')}</span>
            <span className="brand__role">
              {isPlatform ? t('shellPlatformAdmin') : t('shellBackOffice')}
            </span>
          </span>
        </div>

        <nav className="nav" aria-label={t('navSections')}>
          {groups.map((group) => (
            <Fragment key={group.key}>
              {groups.length > 1 && <span className="nav__heading">{t(group.label)}</span>}
              {group.items.map((name) => {
                const entry = tabEntry(name);
                return (
                  // A link, not a button: the sidebar is the panel's map, and
                  // every destination on it can now be copied, opened in a
                  // second tab, or middle-clicked like any other address.
                  <Link
                    key={name}
                    to={tabPath(name)}
                    className="nav__item"
                    aria-current={name === active ? 'page' : undefined}
                  >
                    <Icon name={entry.icon} size={17} />
                    {t(entry.label)}
                  </Link>
                );
              })}
            </Fragment>
          ))}
        </nav>

        {/* Above the account and below the map, because it is neither: it is
            what the panel has to say to whoever is holding it. In the shell
            rather than on the board, since the whole point of a reminder is
            that it reaches somebody who is looking at something else — an order
            due at eight is announced at ten past seven, and nobody is watching
            the Scheduled tab at ten past seven.

            Gated on `orders:read`, which is what the API gates the list on.
            Every notification that exists is about an order, so an account that
            cannot see the board has nothing to be told. */}
        {can(Permission.OrdersRead) && <NotificationBell t={t} />}

        <AccountMenu me={me} onSignOut={onSignOut} />
      </aside>

      <main className="main">
        <div className="main__content">
          {/* Above the error slot, and never dismissible: whoever is reading
              this is looking at a panel that is not theirs, and everything they
              do from here is recorded against their own account. The way out is
              in the strip that says so. */}
          {actingAs !== null && (
            <Banner tone="warn">
              <span className="row spread">
                <span>{t('actingAs', { name: actingAs.name, email: actingAs.email })}</span>
                <Button size="sm" icon="signOut" onClick={onStopActing}>
                  {t('actingStop')}
                </Button>
              </span>
            </Banner>
          )}

          {error !== null && <Banner>{error}</Banner>}

          {active === null && (
            <EmptyState icon="people" title={t('noScreensTitle')} description={t('noScreensDesc')} />
          )}

          {/* `branches` feeds the board's restaurant and branch filters. Passed
              as an empty list while it loads rather than held behind a
              skeleton: the queue is what this screen is for, and it should not
              wait on the pickers that narrow it.

              Where those filters are *pointed* comes from the address, the way
              an open restaurant does — that is what makes one branch's queue a
              link, which is what the button on each branch of the Restaurants
              screen is. */}
          {/* `links` is which of the two lists of people this account can open,
              which decides whether a name in an order's history is a link or
              text. A shift holds `orders:read` and neither of the others, so
              for them the History dialog reads exactly as it did. `canOpenMenu`
              is the same idea for the lines of an order, which link to the dish
              each was ordered from. */}
          {active === 'Orders' && (
            <Orders
              branches={branches ?? []}
              scope={route?.tab === 'Orders' ? route.scope : null}
              links={{
                staff: can(Permission.StaffRead),
                customers: can(Permission.PlatformUsers),
              }}
              canOpenMenu={can(Permission.MenuRead)}
            />
          )}
          {/* Which branch's menu — and which dish on it — comes from the
              address, the way the board's scope does. That is what makes a line
              of an order on the board somewhere to link to. */}
          {active === 'Menu' &&
            (branches === null ? (
              <Skeleton count={4} />
            ) : (
              <MenuScreen
                branches={branches}
                canWrite={can(Permission.MenuWrite)}
                // Whether a name in a dish's history is a link to the person.
                // A shift holds `menu:read` and not `staff:read`, so for them
                // the history reads as text — the same rule the order board's
                // `links` follows.
                canOpenStaff={can(Permission.StaffRead)}
                target={route?.tab === 'Menu' ? route.menu : null}
              />
            ))}
          {/* Loads its own data: adding a branch changes the list it renders, and
              a restaurant with no branches is not in `branches` at all. Which
              restaurant is open comes from the address, so the screen has no
              opinion about it — that is what makes one linkable. */}
          {active === 'Restaurants' && (
            <Restaurants
              branches={branches ?? []}
              canCreate={can(Permission.BranchCreate)}
              canEditRestaurant={can(Permission.RestaurantWrite)}
              canEditBranch={can(Permission.BranchWrite)}
              canReadStaff={can(Permission.StaffRead)}
              canOpenOrders={can(Permission.OrdersRead)}
              open={route?.tab === 'Restaurants' ? route.open : null}
              acting={acting}
            />
          )}
          {/* The way out of a person's roles is the restaurant each one is over,
              which is a screen this account may not hold — so the link is
              offered only when `branch:read` says the destination exists.
              `activityLinks` is the same idea for the entries inside somebody's
              activity: each one names a dish, an order or a branch, and each of
              those lives on a screen behind its own permission. */}
          {active === 'People' && (
            <People
              canInvite={can(Permission.StaffInvite)}
              canReadActivity={can(Permission.StaffActivity)}
              canOpenRestaurants={can(Permission.BranchRead)}
              activityLinks={{
                menu: can(Permission.MenuRead),
                orders: can(Permission.OrdersRead),
                restaurants: can(Permission.BranchRead),
              }}
              person={route?.tab === 'People' ? route.person : null}
              acting={acting}
            />
          )}
          {active === 'Dashboard' && <Dashboard />}
          {/* Which person each of these two is pointed at comes from the
              address, the way an open restaurant does — that is what makes the
              name in an order's history somewhere to link to. */}
          {/* `canOpenOrders` is the same idea as the board's own `links`: an
              order inside a customer's dialog links to itself on the Orders
              screen, and only for an account that can open that screen. */}
          {active === 'Customers' && (
            <Users
              person={route?.tab === 'Customers' ? route.person : null}
              canOpenOrders={can(Permission.OrdersRead)}
            />
          )}
          {active === 'Platform' && <Platform />}
        </div>
      </main>
    </div>
  );
}

/** Initials for the avatar — two at most, and an email as the last resort. */
function initialsOf(profile: StaffProfile | null): string {
  const source = profile?.name?.trim() || profile?.email || '';
  const words = source.split(/[\s@._-]+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase() ?? '').join('') || '·';
}

function AccountMenu({ me, onSignOut }: { me: StaffProfile | null; onSignOut: () => void }) {
  const { language, setLanguage, t } = useLanguage();
  const [theme, setTheme] = useState<Theme>(() => resolveTheme());

  const flip = (): void => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  };

  return (
    <Menu
      align="start"
      trigger={
        <button type="button" className="account">
          <span className="account__avatar" aria-hidden="true">
            {initialsOf(me)}
          </span>
          <span className="account__text">
            <span className="account__name truncate">{me?.name ?? t('accountSignedIn')}</span>
            <span className="account__email truncate">{me?.email ?? '…'}</span>
          </span>
          <Icon name="chevronUp" size={15} />
        </button>
      }
    >
      <MenuLabel>{me?.email ?? t('accountSignedIn')}</MenuLabel>
      <MenuSeparator />
      {/* Alongside the theme, not buried in a settings screen: both are how one
          person prefers to look at the panel, and both get changed on somebody
          else's machine mid-shift. */}
      <MenuLabel>{t('accountLanguage')}</MenuLabel>
      <MenuRadioGroup value={language} onValueChange={(next) => setLanguage(next as Language)}>
        {LANGUAGES.map((option) => (
          <MenuRadioItem key={option} value={option}>
            {t(LANGUAGE_LABEL_KEYS[option])}
          </MenuRadioItem>
        ))}
      </MenuRadioGroup>
      <MenuSeparator />
      <MenuItem icon={theme === 'dark' ? 'sun' : 'moon'} onSelect={flip}>
        {theme === 'dark' ? t('accountThemeLight') : t('accountThemeDark')}
      </MenuItem>
      <MenuSeparator />
      <MenuItem icon="signOut" tone="danger" onSelect={onSignOut}>
        {t('accountSignOut')}
      </MenuItem>
    </Menu>
  );
}
