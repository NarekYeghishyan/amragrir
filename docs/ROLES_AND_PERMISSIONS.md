# ROLES_AND_PERMISSIONS.md

> Amragrir.am roles and access. Model — RBAC (role-based). The role is stored in `users.role`. The mobile app from the design targets the **Customer** role; the Owner/Staff/Admin roles serve the restaurant panel and administration (**[proposed]** — align scope with product).

---

## Roles

| Role | Who | Platform |
|---|---|---|
| **guest** | Unauthenticated / guest entry | Mobile / Web |
| **customer** | Registered client | Mobile / Web |
| **staff** | Restaurant employee (kitchen/counter) | Owner panel |
| **owner** | Restaurant owner/manager | Owner panel |
| **admin** | Platform administrator | Admin panel |

---

## 1. Guest

Limited access until phone verification.
- ✅ Browse restaurants, menus, categories, search, filters.
- ✅ Fill a basket, choose time (demo).
- ✅ Change language/theme.
- ❌ Place an order / pay (phone verification required).
- ❌ Book a table.
- ❌ Favorites, history, rewards, referrals.
- Transition: on attempting to order → auth-gate (verification).

---

## 2. Customer — the app's primary role

- ✅ Search restaurants, apply filters, open cards.
- ✅ Build a basket, place a pre-order (pickup).
- ✅ Book a table (dine-in) with a deposit.
- ✅ Pay (Apple/Google/Card/Cash).
- ✅ Track an order (live status, pickup code).
- ✅ Order history, reorder.
- ✅ Favorites.
- ✅ Profile: points, coupons, referral program.
- ✅ Reviews for their own completed orders.
- ✅ Settings: language, theme, notifications, promo, account.
- ❌ Access others' orders/data.
- ❌ Manage menus/restaurants.

---

## 3. Staff

Rights within **their own branch**.
- ✅ See incoming orders for their branch.
- ✅ Change order status (`confirmed → preparing → almost_ready → ready → completed`).
- ✅ See reservations and mark `seated` / `no_show` / `completed`.
- ✅ Toggle `isOpen`, mark menu items `unavailable`.
- ❌ Edit menu structure/prices (owner only).
- ❌ Access finances/restaurant settings.
- ❌ Other branches/restaurants.

---

## 4. Owner

Full rights over **their own restaurant and branches**.
- ✅ Everything staff can do.
- ✅ CRUD menu (items, prices, categories, photos, dietary tags, prep time).
- ✅ Manage branches (address, hours, geo, `reservationsEnabled`, `services`).
- ✅ Manage tables (creation, capacity, zones).
- ✅ Manage staff (assign `staff` role).
- ✅ View analytics/revenue for their restaurant.
- ❌ Other restaurants' data.
- ❌ Manage platform/users outside their restaurant.

---

## 5. Admin

Full access.
- ✅ Manage users (roles, bans).
- ✅ Manage restaurants (creation, owner verification).
- ✅ Moderate reviews and content.
- ✅ Manage categories, promotions, referral rules.
- ✅ Global analytics and metrics.
- ✅ System settings (fees, rates, deposits).

---

## Permissions matrix (summary)

| Action | guest | customer | staff | owner | admin |
|---|:--:|:--:|:--:|:--:|:--:|
| Browse catalog/menu | ✅ | ✅ | ✅ | ✅ | ✅ |
| Place an order | ❌ | ✅ | — | — | — |
| Book a table | ❌ | ✅ | — | — | — |
| Track own order | ❌ | ✅ | — | — | — |
| Favorites/history/referrals | ❌ | ✅ | — | — | — |
| Process incoming orders | ❌ | ❌ | ✅(branch) | ✅ | ✅ |
| Change order/reservation status | ❌ | ❌ | ✅(branch) | ✅ | ✅ |
| CRUD menu/prices | ❌ | ❌ | ❌ | ✅(own) | ✅ |
| Manage branches/tables | ❌ | ❌ | ❌ | ✅(own) | ✅ |
| Manage staff | ❌ | ❌ | ❌ | ✅(own) | ✅ |
| Manage users/platform | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## Implementation rules

- Permission checks — on the **backend** (guards/policies), not only in UI. The client only hides what's unavailable.
- Owner/Staff resources are always filtered by ownership (`branch_id`/`restaurant_id` == assigned).
- JWT contains `sub` (userId) and `role`; for owner/staff — a list of accessible `branchIds`.
- The guest token is flagged `isGuest`; sensitive endpoints require `phone_verified = true`.
- Resource ownership (own order/reservation/review) is checked in addition to role (ownership guard).

### Implementation status

Implemented in `apps/api`:

- **`JwtAuthGuard` is global** — every endpoint requires a bearer token unless
  it opts out with `@Public()`. Secure by default: forgetting a guard on a new
  endpoint locks it down instead of exposing it.
- **`RolesGuard` is global** too, enforcing `@Roles(...)` and
  `@RequiresVerifiedPhone()`. Access-token claims carry `sub`, `role`,
  `isGuest` and `phoneVerified`, so a guard never has to hit the DB.
- **`guest` is not a DB role.** `users.role` stays `customer` and the account
  is flagged `is_guest`; a guest simply has no verified phone. This is what
  lets phone verification upgrade a guest in place rather than creating a
  second account.

- **Ownership is enforced in the query, not by a guard.** Every order lookup
  filters on `userId`, so there is no code path that loads someone else's
  order and then decides. The consequence is deliberate: another user's order
  returns **404, not 403** — a 403 would confirm the id exists.
- **`@RequiresVerifiedPhone()` gates ordering and paying.** A guest may browse
  and price a basket (`POST /cart/quote`) but gets 403 from `POST /orders`,
  matching §1 above.

Not implemented yet:

- **`branchIds` in the JWT** — lands with the owner module, since nothing
  consumes branch scoping until then.
- **Staff/owner order access** — reading and advancing orders for a branch
  arrives with the owner panel; today only the customer side of an order
  exists.
