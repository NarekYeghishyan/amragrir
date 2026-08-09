// Which combinations of services describe a place that can actually exist — see
// docs/BUSINESS_LOGIC.md §2 — and how a branch's offering resolves against its
// restaurant's defaults.
//
// The rules apply per **branch**: `restaurants.services` is the default a
// branch inherits, and `restaurant_branches.services` is what one that answers
// for itself declares. `resolveBranchOffering` below is where the two meet.
//
// The rules live here rather than in the API because the back office has to
// obey exactly the same ones: a switch that offers a combination the API is
// about to refuse is a form that wastes somebody's afternoon, and two copies of
// "this one needs that one" is two places for it to drift. The panel disables
// what cannot be turned on; the API refuses it anyway, because a disabled
// control is a courtesy and not a check.

import { RestaurantService } from './enums';

/**
 * The order services read in, and the order they are stored in.
 *
 * Rows written before this existed keep whatever order they were seeded with;
 * nothing reads the array positionally (every check is an `includes`), so the
 * order is for whoever opens the row, and it settles the next time somebody
 * saves.
 */
export const SERVICE_ORDER: readonly RestaurantService[] = [
  RestaurantService.Pickup,
  RestaurantService.DineIn,
  RestaurantService.Reserve,
];

/**
 * Two ways of seating somebody, and an address does one of them.
 *
 * **`dinein` and `reserve` exclude each other**, and this one line is what the
 * rest of the file turns on. Both mean "you can eat here"; they differ on what
 * a guest has to do first, and the difference is the whole of it:
 *
 * - **`reserve`** — the table is held in advance. Eating in is the booking
 *   flow: a date, a slot, a table and a deposit against the bill. The order
 *   carries a `reservationId` and runs in `dine_in` mode.
 * - **`dinein`** — the room seats whoever arrives. There is no table to hold
 *   and nothing to put a deposit on, so the guest orders ahead, pays for the
 *   food exactly as any pre-order, and eats it there off a plate instead of out
 *   of a bag. That order is a `pickup` order with `pickup_option = eat_in`; the
 *   only thing it tells the kitchen is to plate rather than bag.
 *
 * Declaring both would be advertising two answers to one question, and would
 * leave the pre-order screen unable to say whether "Eat at the Restaurant"
 * means *press this* or *go and book*. An address that both holds tables and
 * seats walk-ins declares `reserve`: the booking is the stronger promise, and a
 * guest who has one is not helped by also being told they might get lucky.
 */
export const SERVICE_EXCLUDES: readonly (readonly [RestaurantService, RestaurantService])[] = [
  [RestaurantService.DineIn, RestaurantService.Reserve],
];

/**
 * Why a set of services is not a restaurant.
 *
 * Names both sides, so the refusal can be read as a sentence in three languages
 * without the reader re-deriving which service was the problem.
 *
 * One rule shape again, and a different one: `requires` — the dining room that
 * needed a booking — is gone, because a dining room no longer needs one. What
 * is left is the pair that cannot both be true. Kept as a tagged union so a
 * second kind of rule can be added without reshaping every caller.
 */
export type ServiceBreach = {
  rule: 'excludes';
  service: RestaurantService;
  other: RestaurantService;
};

/** True for a value this vocabulary knows. Anything else is a typo or a service
 *  invented after this file was written, and neither is something to reason
 *  about. */
export function isRestaurantService(value: string): value is RestaurantService {
  return (SERVICE_ORDER as readonly string[]).includes(value);
}

/**
 * The first rule this set breaks, or null when it describes a real place.
 *
 * The combinations that pass, which is the whole of BUSINESS_LOGIC.md §2:
 *
 * | pickup | dinein | reserve |                                              |
 * |--------|--------|---------|----------------------------------------------|
 * | ✅     | ❌     | ❌      | a hatch: order ahead and take it away         |
 * | ✅     | ✅     | ❌      | a counter with seats: take it away, or eat in |
 * | ✅     | ❌     | ✅      | take it away, or book a table                 |
 * | ❌     | ✅     | ❌      | a canteen: eat in, nothing to carry out       |
 * | ❌     | ❌     | ✅      | booked tables only                            |
 *
 * The empty set passes too — every restaurant is created having declared
 * nothing, and that is a restaurant somebody has not finished setting up rather
 * than an illegal one.
 *
 * Values outside the vocabulary are ignored rather than rejected: a service
 * nobody has taught this file about is still a service the restaurant
 * advertises, and the DTO is where an unknown value is refused.
 */
export function checkServices(services: readonly string[]): ServiceBreach | null {
  const declared = SERVICE_ORDER.filter((service) => services.includes(service));

  for (const [service, other] of SERVICE_EXCLUDES) {
    if (declared.includes(service) && declared.includes(other)) {
      return { rule: 'excludes', service, other };
    }
  }

  return null;
}

/**
 * The same services, de-duplicated and in `SERVICE_ORDER`.
 *
 * Applied on the way into the database as well as in the panel, so a row reads
 * the same whichever client wrote it — and so an edit that reorders nothing is
 * not diffed as a change (`changedFields` compares arrays as JSON).
 *
 * Values outside the vocabulary are kept, at the end. They are not this
 * function's to throw away: a service nobody has taught this file about is
 * still one the restaurant advertises, and a save that quietly dropped it would
 * be a save that lost something.
 */
export function canonicalServices(services: readonly string[]): string[] {
  const unique = new Set(services);
  return [
    ...SERVICE_ORDER.filter((service) => unique.has(service)),
    ...[...unique].filter((service) => !isRestaurantService(service)),
  ];
}

/**
 * The set that results from turning one service on or off.
 *
 * Canonical, and **turning one on turns its opposite off**. `dinein` and
 * `reserve` are two answers to "how does somebody get a seat here", so choosing
 * one is choosing against the other, and the switch says so by moving both
 * rather than by refusing to move at all.
 *
 * That is the whole of the cascade now. Turning a service *off* takes nothing
 * with it: no service in this vocabulary depends on another any more, so
 * withdrawing one leaves a set that was already legal without it. An address
 * that switches its dining room off is simply one that no longer seats people —
 * which is a real thing to be, and used to be unsayable while `dinein` needed
 * `reserve` to exist at all.
 *
 * Here rather than in the panel so every caller produces a set the API will
 * accept, and so "what does this switch do" has one answer.
 */
export function toggleService(
  services: readonly string[],
  service: RestaurantService,
  on: boolean,
): string[] {
  const next = new Set(services);

  if (on) {
    next.add(service);
    for (const [a, b] of SERVICE_EXCLUDES) {
      if (a === service) {
        next.delete(b);
      } else if (b === service) {
        next.delete(a);
      }
    }
  } else {
    next.delete(service);
  }

  return canonicalServices([...next]);
}

/**
 * What a guest chose to do with a pickup order — the value in
 * `orders.pickup_option`.
 *
 * A **sub-mode**, not a mode: the order is `pickup` either way, and this only
 * says where the food ends up. The kitchen reads it because the answer is a bag
 * or a plate, which is a decision somebody makes before the food is plated
 * rather than when the guest arrives at the counter.
 *
 * Null on a dine-in order, which has a table instead — the database holds the
 * two to that with a CHECK constraint (DATABASE.md §5).
 */
export const PickupOption = {
  /** Collected and taken away — packed for the road. */
  TakeAway: 'take_away',
  /** Collected and eaten where it was cooked — plated rather than bagged. */
  EatIn: 'eat_in',
} as const;
export type PickupOption = (typeof PickupOption)[keyof typeof PickupOption];

/** The order the two read in — take-away first, because it is the one every
 *  place that hands food over offers and the one most guests want. */
export const PICKUP_OPTION_ORDER: readonly PickupOption[] = [
  PickupOption.TakeAway,
  PickupOption.EatIn,
];

/**
 * Whether this address seats people by taking a booking.
 *
 * **The question that decides which of the two seat-getting paths this address
 * runs**, and the reason it is a function rather than an inline `includes`:
 * a good deal below is a consequence of the answer, and so is what three
 * clients draw. A place that takes bookings seats people through the calendar
 * and a deposit; eating in there is not a checkbox on a pre-order.
 *
 * Deliberately the **declaration** (`reserve`) and not the live
 * `reservations_enabled` switch. The two answer different questions: `reserve`
 * says what kind of place this is, `reservations_enabled` says whether it is
 * taking bookings this week. A restaurant that has paused its bookings is still
 * a restaurant, and must not turn into a room that seats walk-ins for one
 * afternoon because somebody flipped a switch in the back office.
 */
export function takesBookings(services: readonly string[]): boolean {
  return services.includes(RestaurantService.Reserve);
}

/**
 * Whether this address has a room that seats whoever turns up.
 *
 * The other path, and the mirror of `takesBookings` — the two cannot both be
 * true (`SERVICE_EXCLUDES`). A guest here pre-orders and pays for the food like
 * any pre-order, then eats it at a table without having held one: there is
 * nothing to book, so there is no deposit and no `reservation`.
 *
 * **Declared, not inferred.** Eating in used to be offered wherever `reserve`
 * was absent, which quietly assumed every place without bookings had somewhere
 * to sit — a hatch on a street corner does not, and it was offering "eat at the
 * restaurant" to people with nowhere to eat it. Having a dining room is a fact
 * about a place, and facts about a place are declared.
 */
export function seatsWalkIns(services: readonly string[]): boolean {
  return services.includes(RestaurantService.DineIn);
}

/**
 * The pickup options this address offers, in the order they read.
 *
 * Empty when it does not do pickup at all — there is then no choice to present
 * rather than a choice of one. A single option is not a question either: a
 * guest shown one button labelled "take away" is being asked to confirm what
 * was never in doubt, so the clients render the pair only when it has two
 * entries, and the API defaults to its first when nothing was chosen.
 *
 * The second entry appears exactly where the address says it has a dining room
 * that seats walk-ins. A place that takes bookings answers with one entry — and
 * the clients still draw the second, dead, next to it. See
 * `eatInRequiresBooking`, which is that separate question.
 */
export function pickupOptionsFor(services: readonly string[]): PickupOption[] {
  if (!services.includes(RestaurantService.Pickup)) {
    return [];
  }
  return seatsWalkIns(services) ? [...PICKUP_OPTION_ORDER] : [PickupOption.TakeAway];
}

/**
 * Whether "eat it here" is shown but leads to the booking flow instead.
 *
 * **Not the same question as `pickupOptionsFor`**, and the reason both exist.
 * That one answers what may be *chosen*; this answers what must still be
 * *shown*. A restaurant's pickup is take-away only, but hiding the other half
 * leaves the guest to discover the rule by not finding it — so the option is
 * drawn, visibly dead, and pressing it switches the order to dine-in and opens
 * the calendar. The rule explains itself at the moment somebody reaches for it,
 * which is the only moment they care.
 *
 * False where there is no pickup to sit under: no pair is drawn there at all,
 * and a lone dead button under a mode nobody picked is furniture.
 */
export function eatInRequiresBooking(services: readonly string[]): boolean {
  return services.includes(RestaurantService.Pickup) && takesBookings(services);
}

/**
 * Whether a pickup order may end this way here — what `POST /orders` refuses
 * on, and what stops a stale basket smuggling an eat-in order into a place that
 * has since started taking bookings.
 *
 * **Deliberately narrower than `pickupOptionsFor`**, and the gap widened with
 * `dinein`. That one asks what to *show*, so it wants the dining room declared
 * before it offers to seat anybody. This asks only whether the chosen ending is
 * *allowed*, and so refuses eat-in on one ground alone: the address takes
 * bookings, and a booking is how somebody sits down there.
 *
 * The asymmetry is the point. A restaurant is created with an empty `services`
 * and a great many never fill it in; making this ask for a declared `dinein`
 * would refuse orders those places have always taken, on the strength of a
 * field nobody has got round to. Showing less than is allowed is a screen being
 * careful. Refusing more than is forbidden is a screen breaking orders.
 *
 * Take-away is never refused: it is what a pre-order *is*, and there is no
 * configuration in which a place that hands food over declines to hand it over.
 */
export function acceptsPickupOption(services: readonly string[], option: PickupOption): boolean {
  return option === PickupOption.TakeAway || !takesBookings(services);
}

/**
 * What a branch declares for itself, or defers to its restaurant on.
 *
 * Three settings that used to belong to the business and now belong to the
 * address: branches of one chain are genuinely different places, and a single
 * row could not say that one has a dining room while another is a counter in a
 * mall.
 *
 * `null` / `false` means "not answered here" in each case — see
 * `resolveBranchOffering` for why the services need a flag rather than a null.
 */
export interface BranchOffering {
  coverUrl: string | null;
  services: readonly string[];
  servicesOverridden: boolean;
  reservationsEnabled: boolean | null;
}

/** The business's defaults, worn by every branch that has not overridden them. */
export interface RestaurantOffering {
  coverUrl: string | null;
  services: readonly string[];
  reservationsEnabled: boolean;
}

/** What a guest is actually offered at one address. */
export interface ResolvedOffering {
  coverUrl: string | null;
  services: readonly string[];
  reservationsEnabled: boolean;
}

/**
 * What this branch actually offers, resolving each setting against the
 * restaurant's default.
 *
 * **The one place inheritance happens.** Every read path goes through it — the
 * catalog, an order's validation, the reservation check, the back office — so
 * there is no second copy to answer differently, which is exactly how a guest
 * ends up shown a service the order endpoint then refuses.
 *
 * The three settings resolve differently on purpose:
 *
 * - **The cover falls back on null.** A branch with no photograph of its own
 *   wearing the business's is better than a blank card, and there is no reason
 *   a branch would want to be blank while its restaurant has a picture — so
 *   "no cover here" and "not answered here" are deliberately the same state.
 * - **The services need an explicit flag.** `[]` is already a legitimate answer
 *   — every restaurant is created having declared nothing — so a branch must be
 *   able to override a parent that offers pickup with a genuinely empty set.
 *   Falling back on emptiness would make that unsayable. (Postgres would allow
 *   a nullable array; Prisma's scalar lists cannot be null, which is the other
 *   half of why the flag exists.)
 * - **Bookings fall back on null**, a plain nullable boolean, because `false`
 *   is a real answer and absent is not.
 */
export function resolveBranchOffering(
  branch: BranchOffering,
  restaurant: RestaurantOffering,
): ResolvedOffering {
  return {
    coverUrl: branch.coverUrl ?? restaurant.coverUrl,
    services: branch.servicesOverridden ? branch.services : restaurant.services,
    reservationsEnabled: branch.reservationsEnabled ?? restaurant.reservationsEnabled,
  };
}

/**
 * Whether a switch may be flipped at all — the question the panel asks per row,
 * and answers by disabling the switch and saying why.
 *
 * Asked as "would the result be legal", so it stays true to `checkServices`
 * without restating any rule — and so it follows `toggleService` when that
 * changes. It answers null for every switch in this vocabulary, because turning
 * one on turns its opposite off: there is no click left that lands on an
 * illegal set. That is not a reason to delete it. The panel asks per row, and a
 * rule added to `SERVICE_EXCLUDES` between three services — where turning one
 * on could not resolve both conflicts at once — would need the row to say so
 * again. Returns the breach rather than a boolean so the reason can be shown;
 * null means go ahead.
 */
export function serviceToggleBreach(
  services: readonly string[],
  service: RestaurantService,
  on: boolean,
): ServiceBreach | null {
  return checkServices(toggleService(services, service, on));
}
