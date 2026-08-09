import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { Language, MenuTab, OrderStatus } from '@amragrir/shared';
import { LanguageProvider } from './i18n';
import { createTranslator } from './language';
import { ActAsButton } from './acting';
import { ActivityDialog } from './activity';
import { CustomerOrdersDialog } from './customer-orders';
import { dishForm } from './dish';
import { DishFields, EditDish } from './dish-form';
import { NotificationBell } from './notifications';
import { OrderQrDialog, QrPlate } from './order-qr';
import type { PhotoUpload } from './photo';
import { Pagination, ToastProvider, TooltipProvider } from './ui';
import type { StaffBranch, StaffMenuItem, StaffOrder } from './api';
import { Orders } from './screens/Orders';
import { Menu } from './screens/Menu';
import { Restaurants } from './screens/Restaurants';
import { People } from './screens/People';
import { Dashboard } from './screens/Dashboard';
import { Users } from './screens/Users';
import { Platform } from './screens/Platform';

/**
 * Every screen renders.
 *
 * `tsc` proves the panel *compiles*; it cannot prove a screen does not throw
 * the moment React runs it — a hook outside its provider, a primitive used
 * with the wrong shape, a Radix part rendered without its parent. Those are
 * exactly the mistakes a component layer introduces, and all of them are
 * invisible to a type check and to a `vite build`.
 *
 * Rendered to a string rather than into a DOM, so this needs no jsdom and no
 * testing library. That limits it to the first paint — effects do not run, so
 * nothing here calls the API — which is the point: this is a smoke test, not a
 * behaviour suite. The first paint is the loading state, and a panel that
 * crashes before its data arrives is broken for everyone.
 *
 * The language is pinned rather than resolved: `resolveLanguage()` reads
 * `localStorage` and `navigator`, neither of which exists here, and a suite
 * whose expected strings depend on the machine it runs on is worthless. English
 * because these assertions are read by whoever is debugging them.
 */
const render = (node: ReactNode, language: Language = Language.En): string =>
  renderToStaticMarkup(
    <LanguageProvider initial={language}>
      <TooltipProvider>
        <ToastProvider>{node}</ToastProvider>
      </TooltipProvider>
    </LanguageProvider>,
  );

const BRANCH: StaffBranch = {
  id: 'b1',
  restaurantId: 'r1',
  restaurantName: 'Dolmama',
  name: 'Northern Ave',
  address: 'Հյուսիսային պող. 12',
  city: 'Yerevan',
  phone: null,
  isOpen: true,
  avgPrepMin: 20,
  menuItemCount: 12,
  // Answers for nothing itself, so it wears the restaurant's — the common
  // case, and the one every screen has to render.
  own: { coverUrl: null, services: [], servicesOverridden: false, reservationsEnabled: null },
  offering: { coverUrl: null, services: ['pickup'], reservationsEnabled: false },
};

/** A second restaurant, so the two-step restaurant → branch picking has
 *  something to pick between. Note the branch name it shares with `BRANCH`. */
const OTHER_BRANCH: StaffBranch = {
  ...BRANCH,
  id: 'b2',
  restaurantId: 'r2',
  restaurantName: 'Lavash',
  name: 'Northern Ave',
};

describe('every screen renders', () => {
  it('renders the order queue', () => {
    expect(render(<Orders branches={[BRANCH]} />)).toContain('Order queue');
  });

  it('renders the shell’s bell, closed and with nothing to report', () => {
    // It lives in the sidebar rather than on a screen, so no other case here
    // mounts it. The list arrives in an effect, which never runs — what this
    // catches is the trigger being built out of parts that mount, and the count
    // staying off until there is a number to put in it.
    const html = render(<NotificationBell t={createTranslator(Language.En)} />);

    expect(html).toContain('Notifications');
    expect(html).not.toContain('bell__count');
  });

  it('renders the menu for a branch', () => {
    const html = render(<Menu branches={[BRANCH]} canWrite />);
    expect(html).toContain('Add a dish');
    expect(html).toContain('Find a dish');
    // The branch picker is a real combobox, not a native <select>.
    expect(html).toContain('role="combobox"');
    // Its *label* is deliberately not asserted. Radix fills the trigger by
    // portalling the selected item's text out of the Select content, which it
    // keeps mounted in a detached node while closed — and that node needs a
    // document. On the server the trigger is therefore empty; in the browser
    // it reads "Northern Ave". This panel only ever runs in a browser.
  });

  it('tells a branchless account where to go instead of showing an empty menu', () => {
    expect(render(<Menu branches={[]} canWrite />)).toContain('No branches yet');
  });

  it('hides the write actions from an account that only reads', () => {
    expect(render(<Menu branches={[BRANCH]} canWrite={false} />)).not.toContain('Add a dish');
  });

  it('says so when a link names a branch this account cannot see', () => {
    // A dish link followed from an account with a wider reach. Showing a
    // different branch's menu under a URL that asked for this one would be
    // worse than saying nothing — a menu is a list of prices somebody acts on.
    const html = render(
      <Menu branches={[BRANCH]} canWrite target={{ branchId: 'b9', itemId: 'dish-1' }} />,
    );
    expect(html).toContain('That branch is not one you can see');
    expect(html).not.toContain('Find a dish');
  });

  it('offers a restaurant picker only when there is more than one', () => {
    // One restaurant is the common case, and a select holding a single option
    // is furniture. The branch picker stays either way — which branch this is
    // the menu of is the context for every price below it.
    const one = render(<Menu branches={[BRANCH]} canWrite />);
    const two = render(<Menu branches={[BRANCH, OTHER_BRANCH]} canWrite />);

    const comboboxes = (html: string) => html.split('role="combobox"').length - 1;
    expect(comboboxes(one)).toBe(1);
    expect(comboboxes(two)).toBe(2);
  });

  // Which branches each picker *holds* is not assertable here — Radix keeps a
  // Select's options in a detached node that needs a document, so none of them
  // reach server-rendered markup (see the note above). That logic lives in
  // `scope.ts` and is tested directly in `scope.spec.ts`.

  it('renders restaurants', () => {
    expect(
      render(
        <Restaurants
          branches={[BRANCH, OTHER_BRANCH]}
          canCreate
          canEditRestaurant
          canEditBranch
          canReadStaff
          canOpenOrders
          open={null}
        />,
      ),
    ).toContain('Restaurants');
  });

  it('renders one restaurant when the address names one', () => {
    // The detail view is a route now, not a click: this is the screen somebody
    // arrives at from a pasted link, before any of its requests have answered.
    const html = render(
      <Restaurants
        branches={[BRANCH]}
        canCreate
        canEditRestaurant
        canEditBranch
        canReadStaff
        canOpenOrders
        open={{ restaurantId: 'r1', branchId: 'b1', assignmentId: null }}
      />,
    );
    // The way back is the list's own address rather than a history entry, so a
    // restaurant opened cold still has one.
    expect(html).toContain('href="/restaurants"');
  });

  it('renders a queue that an address has scoped to one branch', () => {
    // What a branch's "Orders" button leads to, as the board sees it: the scope
    // arrives as a prop from the route and seeds the two pickers before the
    // first fetch. The pickers' own labels are not assertable here — Radix
    // keeps a Select's items in a detached node that needs a document — so what
    // this pins is that a scoped board mounts at all.
    const html = render(
      <Orders
        branches={[BRANCH, OTHER_BRANCH]}
        scope={{ restaurantId: 'r1', branchId: 'b1', orderCode: null }}
      />,
    );
    expect(html).toContain('Order queue');
  });

  // That the button's address and the board's scope are the same thing is
  // proved in `navigation.spec.ts`, against `routePath`/`parseRoute` directly.
  // It cannot be proved here: a branch row needs the restaurant's own request
  // to have answered, and effects do not run in a static render.

  it('renders people', () => {
    expect(render(<People canInvite />)).toContain('Invite someone');
  });

  it('renders the dashboard', () => {
    expect(render(<Dashboard />)).toContain('Dashboard');
  });

  it('renders customers', () => {
    expect(render(<Users />)).toContain('Customers');
  });

  it('renders the platform forms', () => {
    const html = render(<Platform />);
    expect(html).toContain('New restaurant');
    expect(html).toContain('Issue a promo');
  });
});

/**
 * The form behind a row's edit button.
 *
 * Unlike every other dialog here it mounts **open** — the screen renders it only
 * while a dish is being edited — so this is the one case where the whole form is
 * reachable in a static render, fields and all. Which of them a save would
 * actually send is `dish.spec.ts`, against `dishPatch` directly.
 */
describe('editing a dish', () => {
  const DISH: StaffMenuItem = {
    id: 'd1',
    branchId: 'b1',
    categoryId: null,
    menuTab: MenuTab.Mains,
    nameI18n: { hy: 'Խորոված', en: 'Barbecue' },
    descI18n: null,
    priceAmd: 5800,
    caloriesKcal: null,
    prepMin: 25,
    photoUrl: 'https://cdn.amragrir.am/khorovats.jpg',
    dietaryTags: [],
    isAvailable: true,
  };

  /** An upload nobody is running. The real one is a hook, and a hook cannot be
   *  called outside a component — but the fields only ever read these. */
  const IDLE: PhotoUpload = {
    uploading: false,
    clear: () => undefined,
    input: { current: null },
    choose: () => Promise.resolve(),
  };

  const fields = (item: StaffMenuItem = DISH): string =>
    render(
      <DishFields
        form={dishForm(item)}
        onChange={() => undefined}
        upload={IDLE}
        photoHint="Replaces the picture customers see"
        disabled={false}
      />,
    );

  it('mounts', () => {
    // What this catches is the dialog throwing on the way up — a hook outside
    // its provider, a Radix part without its root. It cannot assert what the
    // form *says*: Radix portals a dialog's content into `document.body`, which
    // a static render does not have, so an open dialog reaches the markup as
    // nothing at all. Hence the fields being rendered on their own below.
    expect(() =>
      render(<EditDish item={DISH} onOpenChange={() => undefined} onSaved={() => undefined} />),
    ).not.toThrow();
  });

  it('opens on what the dish is now, so saving nothing changes nothing', () => {
    const html = fields();
    expect(html).toContain('value="Խորոված"');
    expect(html).toContain('value="Barbecue"');
    expect(html).toContain('value="5800"');
    expect(html).toContain('value="25"');
    // The photograph the dish already has, shown as the one a new file would
    // replace rather than as an empty field.
    expect(html).toContain('src="https://cdn.amragrir.am/khorovats.jpg"');
  });

  it('takes a file rather than a URL for the photograph', () => {
    expect(fields()).toContain('type="file"');
  });

  it('leaves a language the dish has no name in empty', () => {
    // Russian, here — an empty box rather than the Armenian name copied into it,
    // which would be a translation nobody wrote.
    expect(fields()).toContain('value=""');
  });

  it('opens a dish with no photograph on an empty field, not a broken image', () => {
    expect(fields({ ...DISH, photoUrl: null, prepMin: null })).not.toContain('upload__preview');
  });
});

/**
 * The way into somebody's account, as both screens that list people place it.
 *
 * `mayActAs` is unit-tested in `staff-ui.spec.ts`; what is proved here is that
 * the control it gates actually mounts — a Radix `ConfirmDialog` rendered
 * without its provider throws at render time and is invisible to `tsc`, which
 * is the whole reason this file exists.
 */
describe('signing in as somebody', () => {
  const ACTING = { selfId: 'super-1', begin: () => undefined };
  const PERSON = { id: 's2', name: 'Ann', email: 'ann@example.am', isActive: true, holdsARole: true };
  const label = 'Sign in as them';

  it('renders the button for a colleague', () => {
    expect(render(<ActAsButton person={PERSON} acting={ACTING} />)).toContain(label);
  });

  it('renders nothing for an account that may not', () => {
    // Null is that case: no `staff:impersonate`, or already acting as somebody.
    expect(render(<ActAsButton person={PERSON} acting={null} />)).not.toContain(label);
  });

  it('renders nothing on your own row', () => {
    const html = render(<ActAsButton person={{ ...PERSON, id: 'super-1' }} acting={ACTING} />);
    expect(html).not.toContain(label);
  });

  it('renders nothing for a deactivated account, or one holding no roles', () => {
    expect(
      render(<ActAsButton person={{ ...PERSON, isActive: false }} acting={ACTING} />),
    ).not.toContain(label);
    expect(
      render(<ActAsButton person={{ ...PERSON, holdsARole: false }} acting={ACTING} />),
    ).not.toContain(label);
  });
});

/**
 * The way into somebody's activity.
 *
 * A Radix `Dialog` whose trigger is rendered on every row of the directory —
 * the same class of thing this file exists to catch, since a dialog part
 * mounted outside its root throws at render time and `tsc` sees nothing wrong.
 *
 * Only the closed state is reachable here: opening it is a click, and the feed
 * behind it arrives through an effect. What the dialog then *says* about an
 * entry is `activity-ui.spec.ts`, against `headline` directly.
 */
describe('opening a person’s activity', () => {
  const PERSON = {
    id: 's2',
    name: 'Ann',
    email: 'ann@example.am',
    isActive: true,
    lastLoginAt: null,
    assignments: [],
  };

  it('renders the trigger, and nothing of the dialog itself', () => {
    const html = render(<ActivityDialog person={PERSON} />);
    expect(html).toContain('Activity');
    // Closed, so Radix has portalled nothing: the feed is not fetched until
    // somebody asks for it, or a page of twenty people is twenty requests for
    // panels nobody opened.
    expect(html).not.toContain('Nothing recorded');
  });

  it('names the person it would open, for anyone not reading the row', () => {
    expect(render(<ActivityDialog person={PERSON} />)).toContain('See what Ann has done');
  });

  it('mounts with every link it can offer turned on', () => {
    // The links live inside the feed, which needs an effect to arrive, so this
    // cannot assert one — what it catches is the prop being wired to something
    // the component chokes on. Which address each entry picks is
    // `activity-ui.spec.ts`, against `placeHref`/`subjectHref` directly.
    const html = render(
      <ActivityDialog person={PERSON} links={{ menu: true, orders: true, restaurants: true }} />,
    );
    expect(html).toContain('Activity');
  });
});

/**
 * The same, for the dialog behind a customer's order count.
 *
 * Its trigger is the count itself rather than a button beside it, which is the
 * one thing here `tsc` cannot check: `asChild` hands Radix's props to whatever
 * element the trigger renders, and a trigger that is not a single focusable
 * element is a dialog nothing opens.
 *
 * Only the closed state is reachable. What the dialog then says about one order
 * — where it leads, what its bill reads — is `customer-orders-ui.spec.ts`,
 * against `orderHref` and `billLines` directly.
 */
describe('opening one customer’s orders', () => {
  const CUSTOMER = {
    id: 'u1',
    name: 'Aram',
    phone: '+374******56',
    email: null,
    role: 'customer',
    isGuest: false,
    phoneVerified: true,
    ordersCount: 11,
    rewardPoints: 40,
    createdAt: '2026-07-01T10:00:00.000Z',
  };

  it('renders the count as the trigger, and nothing of the dialog itself', () => {
    const html = render(<CustomerOrdersDialog user={CUSTOMER} />);
    expect(html).toContain('>11<');
    // Closed, so Radix has portalled nothing: the orders are not fetched until
    // somebody asks, or a page of twenty-five customers is twenty-five requests
    // for dialogs nobody opened.
    expect(html).not.toContain('No orders yet');
  });

  it('names whose orders it would open, for anyone not reading the row', () => {
    // The visible text is a bare number, so the accessible name is the only
    // thing that says what this control is. Asserted without the apostrophe:
    // `renderToStaticMarkup` escapes it inside an attribute.
    expect(render(<CustomerOrdersDialog user={CUSTOMER} />)).toContain('aria-label="Open Aram');
  });

  it('says so rather than showing a blank when the diner never gave a name', () => {
    const html = render(<CustomerOrdersDialog user={{ ...CUSTOMER, name: null }} />);
    expect(html).toContain('No name');
  });

  it('mounts with the link out to the order board turned on', () => {
    // The link lives inside the list, which needs an effect to arrive, so this
    // cannot assert one — what it catches is the prop being wired to something
    // the component chokes on.
    expect(render(<CustomerOrdersDialog user={CUSTOMER} canOpenOrders />)).toContain('>11<');
  });
});

/**
 * Handing an order's code to a scanner.
 *
 * The path the code is drawn as is `qr.spec.ts`; what is proved here is that
 * the button on every card of the board mounts, and that the picture behind it
 * carries an accessible name — a `<svg>` of six hundred squares is nothing at
 * all to a screen reader without one, and no type check has an opinion.
 *
 * `QrPlate` is rendered on its own because the dialog around it opens on a
 * click, which this file cannot do.
 */
describe('an order’s code as a QR code', () => {
  const t = createTranslator(Language.En);
  const ORDER: StaffOrder = {
    id: 'o1',
    code: 'AMR-48219031',
    status: OrderStatus.Preparing,
    serviceMode: 'pickup',
    pickupOption: 'take_away',
    branch: { id: 'b1', name: 'Northern Ave' },
    customerName: 'Aram',
    itemsCount: 2,
    totalAmd: 8600,
    paymentStatus: null,
    readyAt: null,
    secondsLeft: 420,
    // An ordinary order, wanted as soon as possible: no warning to give, and so
    // no lead either — the two are set together and cleared together.
    scheduled: false,
    prepStartAt: null,
    prepMin: 25,
    reminderAt: null,
    reminderLeadMin: null,
    createdAt: '2026-08-02T09:30:00.000Z',
    items: [{ menuItemId: 'd1', name: 'Khorovats', qty: 1, lineTotalAmd: 5800 }],
    notes: null,
  };

  it('renders the trigger on the card, and nothing of the code itself', () => {
    const html = render(<OrderQrDialog t={t} order={ORDER} />);
    expect(html).toContain('QR code');
    // Closed, so Radix has portalled nothing — and nothing has been encoded.
    expect(html).not.toContain('AMR-48219031');
  });

  it('draws the full order code, not the four digits the counter calls out', () => {
    // The pickup code names one order among the ones on the board; this is the
    // one that names it in the database, and it is the whole reason to scan
    // rather than read.
    const html = render(<QrPlate value={ORDER.code} label={`QR code for order ${ORDER.code}`} />);
    expect(html).toContain('aria-label="QR code for order AMR-48219031"');
    expect(html).toContain('role="img"');
    // Version 1 plus the four-module quiet zone on each side.
    expect(html).toContain('viewBox="0 0 29 29"');
    expect(html).toContain('<path');
  });
});

describe('every screen renders in every language', () => {
  const screens: [string, ReactNode][] = [
    ['orders', <Orders key="o" branches={[BRANCH]} />],
    ['menu', <Menu key="m" branches={[BRANCH]} canWrite />],
    [
      'restaurants',
      <Restaurants
        key="r"
        branches={[BRANCH, OTHER_BRANCH]}
        canCreate
        canEditRestaurant
        canEditBranch
        canReadStaff
        canOpenOrders
        open={null}
      />,
    ],
    ['people', <People key="p" canInvite />],
    ['dashboard', <Dashboard key="d" />],
    ['customers', <Users key="c" />],
    ['platform', <Platform key="f" />],
  ];

  // The panel is set per person, so any of the three is somebody's whole day.
  // A key that exists in `hy` and not in `ru` falls back rather than throwing,
  // which is deliberate — so what this catches is the other failure: a screen
  // that renders in one language and crashes in another.
  for (const language of [Language.Hy, Language.Ru, Language.En]) {
    for (const [name, screen] of screens) {
      it(`renders ${name} in ${language}`, () => {
        expect(render(screen, language).length).toBeGreaterThan(0);
      });
    }
  }

  it('renders the pager, and nothing at all for a single page', () => {
    const pager = (total: number) => (
      <Pagination
        page={1}
        pageSize={25}
        total={total}
        onPage={() => undefined}
        labels={{
          nav: 'Pages',
          previous: 'Previous',
          next: 'Next',
          page: (n) => `Page ${n}`,
          range: `1–25 of ${total}`,
        }}
      />
    );

    const many = render(pager(312));
    expect(many).toContain('1–25 of 312');
    expect(many).toContain('aria-current="page"');
    expect(many).toContain('Page 13'); // the last page, 312 / 25 rounded up

    // A pager under a list that fits on one screen is furniture. (The wrapper's
    // own toast viewport is always in the markup, so this asks for the absence
    // of the pager rather than an empty string.)
    expect(render(pager(25))).not.toContain('class="pager"');
    expect(render(pager(0))).not.toContain('class="pager"');
  });

  it('says the same thing in Armenian that it says in English', () => {
    // Not a translation check — a wiring one. The header comes from a key, so
    // it has to change with the language rather than being baked in.
    expect(render(<Users />, Language.Hy)).toContain('Հաճախորդներ');
    expect(render(<Users />, Language.Ru)).toContain('Клиенты');
  });
});
