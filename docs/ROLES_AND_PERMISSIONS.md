# ROLES_AND_PERMISSIONS.md

> Amragrir.am roles and access. **Two separate identities**: customers, who order
> food, and staff, who run restaurants and the platform. They live in different
> tables, sign in with different credentials, and carry different tokens.

---

## The two identities

| | Customers | Staff |
|---|---|---|
| Table | `users` | `staff_users` |
| Sign in with | Phone + OTP | Email + password |
| Created by | Signing up (or a guest session) | **Invitation only** — there is no sign-up |
| Roles | `guest`, `customer` | `super_admin`, `platform_admin`, `restaurant_admin`, `restaurant_manager`, `branch_staff` |
| Where the role lives | `users.role` | `staff_assignments` — one row per role **per scope** |
| Client | Mobile app, website | Back office (`apps/admin`) |

**A customer account cannot become staff, and staff cannot order food.** The
person who manages a restaurant and eats at one has two accounts. That is the
point, not an inconvenience: a staff row previously carried reward points,
favourites and an order history, and any customer was one `UPDATE` away from
managing a restaurant.

Tokens are separate too. Both are signed with the same secret, so a staff token
carries `kind: 'staff'` and the customer guard refuses it — and the staff guard
refuses a token without it. Neither can be used on the other's endpoints.

---

## Customer roles

### 1. Guest

Limited access until phone verification. `guest` is **not** a database value —
it is the `users.is_guest` flag, which is what lets verification upgrade a guest
in place rather than creating a second account.

- ✅ Browse restaurants, menus, categories, search, filters.
- ✅ Fill a basket, price it (`POST /cart/quote`), choose a time.
- ✅ Change language/theme.
- ❌ Place an order / pay (phone verification required).
- ❌ Book a table.
- ❌ Favorites, history, rewards, referrals — they belong to an account rather
  than a device, and a guest session would lose them.
- Transition: on attempting to order → auth-gate (verification).

### 2. Customer — the app's primary role

- ✅ Search restaurants, apply filters, open cards.
- ✅ Build a basket, place a pre-order (pickup).
- ✅ Book a table (dine-in) with a deposit.
- ✅ Pay (Apple/Google/Card — online only).
- ✅ Cancel an order **they have not paid for yet**; after that, nobody can.
- ✅ Track an order (live status, pickup code).
- ✅ Order history, reorder.
- ✅ Favorites.
- ✅ Profile: points, coupons, referral program.
- ✅ Reviews for their own completed orders.
- ✅ Settings: language, theme, notifications, promo, account.
- ❌ Access others' orders/data.
- ❌ Anything in the back office.

---

## Staff roles

A staff role means nothing until it names a scope. `restaurant_manager` is not
"a manager" — it is "a manager **of branch X**", and an account managing two
branches holds two assignments.

| Role | Scope it carries | Runs |
|---|---|---|
| `super_admin` | none (platform) | Everything, including appointing platform staff |
| `platform_admin` | none (platform) | Support: metrics, customers, promos, every restaurant — but **not** platform staff or pricing |
| `restaurant_admin` | one restaurant | That restaurant and all its branches: menu, branches, staff, analytics |
| `restaurant_manager` | one branch | That branch: orders, reservations, tables, availability, open/closed |
| `branch_staff` | one branch | The shift: the queue, the book, sold-out flags, the open/closed switch |

The scope shape is enforced twice: a `CHECK` constraint on `staff_assignments`
(platform roles carry neither id, restaurant roles a restaurant, branch roles a
branch) and `ROLE_SCOPE` in `packages/shared/src/staff-roles.ts`, which fails
first with a readable message.

### What each may do

The authoritative list is `ROLE_PERMISSIONS` in
`packages/shared/src/staff-roles.ts`. It is code rather than a table because a
permission only means something next to an endpoint that checks it — adding one
is a code change either way, and keeping it here lets the back office render its
screens from the same map the API enforces.

| Permission | `branch_staff` | `restaurant_manager` | `restaurant_admin` | `platform_admin` | `super_admin` |
|---|:--:|:--:|:--:|:--:|:--:|
| `orders:read` / `orders:advance` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `reservations:read` / `:advance` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `menu:read` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `menu:availability` (sold out) | ✅ | ✅ | ✅ | ✅ | ✅ |
| `branch:read` / `branch:hours` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `branch:write` (address, phone, tables, booking policy) | ❌ | ✅ | ✅ | ✅ | ✅ |
| `tables:write` | ❌ | ✅ | ✅ | ✅ | ✅ |
| `menu:write` (prices, dishes) | ❌ | ❌ | ✅ | ✅ | ✅ |
| `branch:create` | ❌ | ❌ | ✅ | ✅ | ✅ |
| `restaurant:write` (services) | ❌ | ❌ | ✅ | ✅ | ✅ |
| `analytics:read` | ❌ | ❌ | ✅ | ✅ | ✅ |
| `staff:read` / `:invite` / `:revoke` | ❌ | ❌ | ✅ | ✅ | ✅ |
| `staff:activity` (what someone did) | ❌ | ❌ | ✅ | ✅ | ✅ |
| `restaurant:create` | ❌ | ❌ | ❌ | ✅ | ✅ |
| `platform:metrics` / `platform:users` | ❌ | ❌ | ❌ | ✅ | ✅ |
| `promo:issue` | ❌ | ❌ | ❌ | ✅ | ✅ |
| `platform:staff` | ❌ | ❌ | ❌ | ❌ | ✅ |
| `staff:impersonate` | ❌ | ❌ | ❌ | ❌ | ✅ |
| `settings:write` | ❌ | ❌ | ❌ | ❌ | ✅ |

Four splits are deliberate:

- **A shift may flip a dish sold out but not price it.** Availability says what
  is true right now and reverses in a tap; a price outlives the shift that set
  it. Two permissions, two endpoints.
- **A manager runs a branch but does not hire or see revenue.** Prices, staff
  and money belong to whoever owns the business. Widening this is one line in
  `ROLE_PERMISSIONS` if a real restaurant disagrees.
- **`platform_admin` cannot appoint platform staff or change pricing.** An
  account that can appoint platform staff can appoint itself anything.
- **`staff:activity` is separate from `staff:read`.** Knowing who works here is
  a directory; knowing everything somebody did is a record of a person's working
  day. The two are granted together today, and the split is what keeps taking
  the second away possible without closing the first.

---

## What is recorded

Every staff action that outlives the moment writes a row to `audit_log`, **in
the same transaction as the change it describes** — a log written afterwards has
gaps in it exactly when something failed halfway, which is when it is read. The
exceptions are `staff.impersonate` and `customer.phone_view`, neither of which
has a transaction to join: signing a token is not a database write, and neither
is reading a column.

| Action | Written by | Permission behind it |
|---|---|---|
| `menu_item.create` / `.update` / `.delete` | `MenuService` | `menu:write` |
| `menu_item.availability` | `MenuService` | `menu:availability` |
| `restaurant.services` | `MenuService` | `restaurant:write` |
| `restaurant.cover` | `MenuService` | `restaurant:write` |
| `branch.cover` / `branch.services` / `branch.bookings` | `MenuService` | `branch:write` |
| `branch.create` | `MenuService` | `branch:create` |
| `branch.update` | `MenuService` | `branch:write` |
| `branch.status` | `MenuService` | `branch:hours` |
| `table.create` / `table.update` / `table.delete` | `BookingSettingsService` | `branch:write` |
| `branch.booking_hours` | `BookingSettingsService` | `branch:hours` |
| `branch.closure_create` / `branch.closure_delete` | `BookingSettingsService` | `branch:hours` |
| `booking_policy.update` | `BookingSettingsService` | `branch:write` · `restaurant:write` |
| `reservation.table` | `RestaurantReservationsService` | `reservations:advance` |
| `staff.invite` | `InvitesService` | `staff:invite` |
| `staff.invite_revoke` / `staff.assignment_revoke` | `StaffDirectoryService` | `staff:invite` / `staff:revoke` |
| `staff.impersonate` | `ImpersonationService` | `staff:impersonate` |
| `customer.phone_view` | `AdminService` | `platform:users` |
| `reservation.status` | `RestaurantReservationsService` | `reservations:advance` |

**One of them records a read rather than a write.** `customer.phone_view` is
written by `GET /admin/users/{id}/phone`, which hands back one diner's number in
full. The customer list masks every number precisely so a page of them is not
something anybody can photograph, and a mask that whoever holds `platform:users`
can lift silently is not really a mask. Nothing changed, so there is no
before/after pair: `after` carries the **masked** number, which says *which*
number was read without making the row a second permanent readable copy of it.
The entry is written before the answer is returned — a failure to record is a
failure to reveal, because a number handed out with no row saying who asked is
the gap this exists to close. Like `staff.impersonate` it carries no scope on
either column, which keeps it readable only by a platform role. It is also the
only entry here whose `entity` belongs to the *other* identity (`customer`, a
`users` row), because it is a thing staff do to a customer record.

**Order status changes are not here.** They live in `order_events`, which
records the customer and the payment provider too — folding them in would mean a
NULL actor on most rows. `GET /staff/{id}/activity` merges the two tables at
read time so one fact has one record.

**Sold-out flips are their own action**, not a `menu_item.update` carrying one
field: a shift holds `menu:availability` and not `menu:write`, so folding them
together would make every sold-out flip read as a menu edit.

**A PATCH that changed nothing writes nothing.** Entries carry only the fields
that actually moved, diffed against the loaded row rather than taken from the
request body — a form that submits every field re-sends the price nobody
touched, and "changed the price from 2400 to 2400" is the noise that makes a
real change hard to find.

**An impersonated change names both people.** `actor_staff_id` is the account
acted as (what every guard and scope filter already uses) and `acting_staff_id`
is the super admin really at the keyboard. Recording only the first would file
the change against somebody who was not there. Such an entry appears in **both**
feeds — the impersonated account's, because its account made the change, and the
super admin's, because they did.

---

## Who can read it

The same table is read two ways, behind two different permissions, because
"what happened to this thing" and "what has this person been doing" are
different questions and deserve to be separately grantable.

| Read | Endpoint | Permission |
|---|---|---|
| One **dish's** history | `GET /restaurant/menu-items/{id}/history` | `menu:read` |
| One **order's** timeline | `GET /restaurant/orders/{id}/history` | `orders:read` |
| One **person's** activity | `GET /staff/{id}/activity` | `staff:activity` |

**An entity's own history sits behind the permission that reads the entity.**
Whoever may read the menu may read how it came to say what it says — a price
with no answer to "who set this, and when" is exactly the gap `audit_log` was
written to close, and putting it behind a management-only permission would keep
it from the shift standing in front of the disputed number. This is the same
rule an order's timeline already follows.

**A person's activity is the one that needs `staff:activity`.** It crosses every
dish and every order that person touched, which is a record of a working day
rather than of a thing. See the note above on why it is separate from
`staff:read`.

**Both are scoped, and scoped differently.** The per-entity reads check *the
entity* against the caller's reach and then take its entries whole: a dish
cannot change branch, so every row about it happened where the reach was already
checked. The per-person read has to filter *the entries* as well, because
somebody can work in two restaurants and their admin may only see one — which is
why `audit_log` carries `restaurant_id` and `branch_id` at all.

**A withdrawn dish still answers.** The per-dish read is the one menu read that
does not filter out `deleted_at`: the dish somebody took off the menu is
precisely the one they come back to ask about, and a history that disappeared
with its subject would be missing at the moment it is wanted.

---

## Signing in as somebody else

A `super_admin` can open any staff account and use the back office as that
person — to see what they are reporting, or to fix it for them. `POST
/staff/{id}/impersonate`, gated by `staff:impersonate`. The back office offers
it wherever it names a person: the People directory, and a restaurant's own
page, both among its admins and inside each branch's team.

**Why only `super_admin`.** Impersonating is a way to *use* every permission the
target holds, so the permission is worth exactly the union of what the people
in reach can do. For a super admin that union is a subset of what they already
have — acting as a restaurant admin **narrows** their reach — so it grants
nothing new. For any narrower role it would grant plenty, which is why it sits
beside `platform:staff` rather than with the rest of `staff:*`.

The rules the endpoint enforces:

- **The session cannot be extended.** It returns an access token and **no
  refresh token**. `/auth/staff/refresh` re-reads the target's assignments and
  mints a fresh pair from them, which would drop the impersonation marker on the
  way through — a bounded session would silently become an unlimited one,
  indistinguishable from the person's own. Without a refresh half it closes
  itself after one access TTL and the panel drops back to the super admin.
- **It does not chain.** A token already acting as somebody may not begin
  another. The marker holds one id, so a second hop would either overwrite the
  real actor or record somebody who was themselves being acted as.
- **Not yourself, not a deactivated account, not one holding no roles.** The
  last two are the refusals their own password would get; the first would hand
  back a strictly worse version of the session they already have.
- **404, not 403, for an account outside reach** — the same rule as everywhere
  else here.

**The token says who is really there.** `sub` stays the person being acted as,
so every guard, scope filter and query behaves exactly as it would for them —
that is the point of impersonating rather than granting yourself their rows. The
super admin's id travels beside it in `act`, which is what makes the session
distinguishable from a real sign-in at all.

**Every impersonation is written to `audit_log`** (`staff.impersonate`) before
the token is issued, with the real actor, the target, the roles being borrowed
and the IP. The session carries full write access, so without that row the only
record of who advanced an order would name the person who did not do it. This
is the table's first writer.

**Ending it costs no round trip.** The super admin's own tokens were never
revoked — the back office stashes them and puts them back — so there is no
"stop impersonating" endpoint to build or to guard.

**Customers cannot be impersonated.** Not an oversight and not a permission
question: a customer session belongs to the other identity entirely, and there
is nowhere to put one — `apps/web` has no sign-in, and the back office has no
customer screens. It would also mean a staff account able to spend somebody's
saved payment methods and reward points. If it is ever wanted, it needs customer
auth in the web app first and a decision about whether it may order and pay.

---

## How reach is decided

Two different questions, deliberately kept apart:

1. **May this account call this endpoint at all?** `@RequiresPermission(...)`
   on the route, checked by `StaffAuthGuard` against the token's scopes.
2. **Which rows may it touch?** `src/staff/scope.ts` turns the scopes into a
   Prisma filter *for that permission*, applied to every query.

Conflating them is how an endpoint ends up correctly guarded and still returning
someone else's data.

Reach is **per permission**, and only the roles granting it count. An account
that administers one restaurant and also works a shift somewhere else may edit
the first restaurant's menu and not the second's — building a filter from every
role held would hand them both.

As before, ownership lives in the query rather than in a check afterwards, so a
row outside the caller's reach is **404, not 403** — a 403 would confirm it
exists.

---

## Covers, services and bookings: the business's default, the branch's answer

**Revised 2026-08-04, the same day the restaurant-level version was built.**
The first version put all three on the restaurant, covering every branch at
once. That was the wrong shape and was changed on the evidence: branches of one
chain are genuinely different places, and one row could not say that one has a
dining room while another is a counter in a mall.

Both levels now exist, and the split is the permission:

| | Sets | Permission | Means |
|---|---|---|---|
| `restaurants.*` | `restaurant_admin`+ | `restaurant:write` | The **default** every branch inherits |
| `restaurant_branches.*` | `restaurant_manager`+ | `branch:write` | What **this address** offers |
| `tables` · `booking_policies` (branch) | `restaurant_manager`+ | `branch:write` | The room, and the numbers behind the offer |
| `restaurant_branches.booking_hours` · `branch_closures` | `branch_staff`+ | `branch:hours` | When the doors are open, and which days they are not |
| `booking_policies` (restaurant) | `restaurant_admin`+ | `restaurant:write` | The chain's defaults, for every address it has |

A manager already holds `branch:write` for their branch's address and phone, so
a photograph and a service list for that same address fit it exactly — they
answer for one place and nothing else. Changing what the *chain* defaults to is
still a restaurant admin's decision, which is what keeps a manager from
answering for branches they do not run.

**`resolveBranchOffering` in `@amragrir/shared` is the one place inheritance
happens.** Every read path goes through it — the catalog, an order's validation,
the reservation check, the back office — so a guest is never shown a service the
order endpoint then refuses.

**Three settings, three resolutions**, and the differences are deliberate:

- **The cover falls back on `null`.** "No cover here" and "not answered here"
  are the same state on purpose; there is no reason a branch would want to be
  blank while its restaurant has a photograph.
- **The services need an explicit flag** (`services_overridden`). `[]` is
  already a legitimate answer — every restaurant is created having declared
  nothing — so a branch must be able to override a parent that offers pickup
  with a genuinely empty set, which falling back on emptiness would make
  unsayable.
- **Bookings fall back on `null`**, a plain nullable boolean, because `false` is
  a real answer and absent is not.

The catalog's service filter asks each branch the same question the resolver
does: an overriding branch is matched on its own array, every other on its
parent's. Filtering the restaurant alone would return branches that had
withdrawn the very service somebody filtered for.

**It is two requests, like a dish photograph.**
`POST /uploads/restaurant-cover` stores the file and answers with a URL;
`PATCH /restaurant/restaurants/:id/cover` puts that URL on the restaurant. The
upload grants no reach on its own — it writes a file and names it — and the
PATCH is where the caller's scope decides *which* restaurant may wear it. An
abandoned form therefore costs an orphaned image rather than a half-changed row,
which is the same known trade the menu photos make (nothing sweeps the orphans
yet).

The file lands in `covers/` rather than beside the dishes in `menu/`: the two
sit behind different permissions and are wanted at different sizes, so whoever
later adds thumbnailing or a sweep can act on one without reasoning about the
other.

**`coverUrl: null` takes a cover down**, and is the one place this differs from
a dish, which is required to have a picture. The column has always been
nullable, every client already draws that state, and a restaurant that wants its
photograph gone has no other way to say so. The DTO refuses an *absent* field
for the same reason it accepts an explicit null — an empty body would otherwise
read as "remove it", which nobody typing it would have meant.

**A replaced cover is not deleted from disk**, and the `restaurant.cover` audit
entry carries the URL it replaced — which is what makes a cover replaced by
accident recoverable at all.

**The seed fills the column** (`prisma/restaurant-covers.ts`) so the screens
that read it can be looked at, and the upload overwrites a seeded value freely
while the seed keeps refusing to overwrite an upload (`isSeedCover`). The mobile
side needed nothing: its `Photo` component already rendered the URL and fell
back to the placeholder surface without one.

## Implementation status

Implemented in `apps/api`:

- **`JwtAuthGuard` and `RolesGuard` are global** and cover the customer side.
  `StaffAuthGuard` is global too and inert on anything not marked
  `@StaffRoute()` / `@RequiresPermission()`; `JwtAuthGuard` stands down on those.
  A route belongs to exactly one of the two identities.
- **`@RequiresVerifiedPhone()` gates ordering and paying.** A guest may browse
  and price a basket but gets 403 from `POST /orders`.
- **Staff sign in at `POST /auth/staff/login`** with email and password (scrypt
  from `node:crypto`, parameters stored in the hash so the cost can be raised
  later without invalidating anyone). Every failure answers identically —
  wrong password, unknown address, deactivated account, invitation never
  accepted — because a login endpoint that distinguishes them is a way to find
  out who works here. An unknown address still burns the same time a real
  verification would.
- **An account with valid credentials and no roles is refused with a plain
  message**, not a token. It is a real dead end rather than an attack surface,
  and a token would produce a panel where every screen 403s.
- **Accounts are created by invitation** (`POST /staff/invites`). The raw token
  lives in the email and nowhere else; the row stores its digest. If the address
  already belongs to an active account, the role is granted immediately and no
  "set your password" email is sent — training people to click password links
  they did not ask for is its own vulnerability.
- **Nobody may grant what they do not hold.** Checked twice: the role's
  permissions must be a subset of the inviter's, and its scope must be within
  their reach. Otherwise a restaurant admin could invite a `super_admin` and
  take over the platform through a role nobody gave them.
- **Revoking a role ends that account's sessions.** Scopes travel in the access
  token, so the revoked role would otherwise keep working until it expired;
  killing the refresh tokens bounds that to the 15-minute access TTL, and the
  next refresh re-reads the assignments.
- **The last `super_admin` cannot be removed**, and nobody may remove their own
  role — there is no route to appoint another one afterwards.
- **A password reset ends every session too.** Whoever reset it may have done so
  because somebody else knows the old one.
- **The back office is a client like any other.** `apps/admin` holds no
  privileges; its permission checks only decide which tabs render.
- **`paid` is not a status the panel may set.** Only a payment makes an order
  paid; a restaurant that could set it could mark an unpaid order as settled.
- **A coupon code is personal.** Lookups are keyed on `(user_id, code)`.
- **WebSocket subscriptions authorise per order**, trying both identities and
  applying the same visibility rule as the REST endpoints.
- **A super admin may sign in as any staff account** (`POST
  /staff/{id}/impersonate`), for one access TTL, with no way to extend it and no
  chaining — see "Signing in as somebody else" above. It writes `audit_log` with
  no scope on either column, which is what keeps the row readable only by a
  platform role.
- **Every change to an order is recorded in `order_events`**, in the same
  transaction as the change: who moved it, from what to what, and when. Under an
  impersonated session the entry carries **both** — the account being acted as
  *and* the super admin behind it — because the staff token's `sub` is the
  former, and recording only that would credit the change to somebody who was
  not at the keyboard.
- **Reading that trail is `orders:read`**, not `orders:advance`: a shift that may
  only watch the queue still has to be able to answer "when did this come in and
  who confirmed it" at the counter.
- **Retiming a pre-order's warning is `orders:advance`**
  (`PATCH /restaurant/orders/{id}/reminder`), not a permission of its own. It is
  the same person, at the same pass, deciding about the same order — and it moves
  nothing the customer was promised: the food is still due at the same minute and
  the price is unchanged. What moves is how much notice the kitchen gives itself,
  which is a decision about their own shift. It writes an `order_events` row of
  type `reminder_set` naming who did it and the notice it replaced, because
  `orders.reminder_lead_min` is overwritten in place and that entry is the only
  record it ever moved.
- **A branch's notifications are `orders:read`** (`GET /staff/notifications`,
  `POST /staff/notifications/read`, and the socket's `watchBranches`). Every
  notification that exists is about an order, so inventing `notifications:read`
  would create a permission nobody could hold without also holding this one. The
  rows are addressed to a **branch**, and read-marks are per person: the first
  colleague to open the bell must not clear it for the shift.
- **A person's activity is scoped twice** (`GET /staff/{id}/activity`): to
  somebody the caller can already see in the directory, and then to the entries
  inside the caller's own reach. Someone who works for two restaurants shows each
  admin only their own half — seeing that a person works for you does not mean
  seeing what they did for somebody else.
- **A restaurant's cover is uploaded and set behind `restaurant:write`**
  (`POST /uploads/restaurant-cover`, then
  `PATCH /restaurant/restaurants/{id}/cover`) — a `restaurant_manager` holds
  neither. See "Who uploads a restaurant's cover photo" above.
- **Taking a dish off the menu is a soft delete**, so a dish that has been
  ordered can finally be removed. It needs `menu:write`; `menu:availability` only
  reaches the reversible sold-out flag.
- **A customer's phone number is masked in the list and unmasked one at a time**
  (`GET /admin/users/{id}/phone`), with an `audit_log` row per reveal. Both
  halves are the same rule: support needs one number, nobody needs a readable
  page of them, and a mask that lifts without a trace is decoration.
- **What a customer has ordered is `platform:users`, not `orders:read`.** The
  order board is scoped to the branches a shift can reach and answers "what is
  this kitchen working on"; `GET /admin/users/{id}/orders` crosses every
  restaurant on the platform to answer "what has this person bought", so it
  belongs to whoever may see the person at all.

### What the split removed

- **`PATCH /admin/users/{id}/role` is gone.** Promoting a customer into staff is
  no longer possible in either direction, which is the whole point. The four
  refusals it used to carry (own role, guest, last admin, owner with
  restaurants) are gone with it — the states they protected against cannot
  arise now.
- **`restaurants.owner_id` no longer decides anything.** Who administers a
  restaurant is a `restaurant_admin` assignment — a set, not a single id, which
  is what makes two administrators or a handover expressible. The column is kept
  nullable as the only record of the original owner for restaurants whose owner
  had no email and so could not be migrated.
- **`/owner/*` is now `/restaurant/*`.** "Owner" stopped being a role.

Not implemented yet:

- **`GET|POST|PATCH /restaurant/tables`** — `tables:write` exists in the map and
  has no endpoints behind it yet.
- **TOTP two-factor for platform roles.** Worth having on the accounts that can
  appoint staff and issue promos; not built.
- **A date filter on the activity feed.** The endpoint caps `page` at 25,
  because merging two tables by offset costs the whole prefix of both — the cost
  is in the offset, not the page size. Twenty-five pages is far more than anyone
  scrolls to review somebody's work, and a date range is the right answer for
  going further back whenever it is actually needed.
- **Restoring a soft-deleted dish.** The row survives, so an undelete is one
  endpoint; nothing offers it, because the row is kept for history and order
  integrity rather than as a recycle bin.
- **Impersonating a customer.** Blocked on customer sign-in existing in
  `apps/web` at all — see the end of "Signing in as somebody else".
