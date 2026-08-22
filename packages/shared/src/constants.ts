// Numeric business constants — see docs/BUSINESS_LOGIC.md §10 "Key constants (for config)".
// [design] values are demo/prototype values; move to platform/restaurant config before launch
// rather than editing them here in place (see AI_CONTEXT.md "What NOT to do").

/** Fixed service fee per order, in AMD (integer, dram has no minor unit). [design] */
export const SERVICE_FEE_AMD = 360;

/** Table deposit per guest, in AMD. Credited to the final bill, never an extra charge. [design] */
export const DEPOSIT_PER_GUEST_AMD = 2000;

/**
 * How long before a table is due the guest is reminded of it, in minutes.
 *
 * **Three hours rather than "the day before".** A reminder the previous evening
 * cannot serve a table booked this morning for tonight, which is a large share
 * of bookings; three hours reaches both, and is still long enough to be useful
 * — it is time to set off, or to cancel and free the table for somebody else.
 *
 * A constant rather than a `booking_policies` column, for now. Making it
 * per-branch is a real want — a place taking bookings weeks out may prefer a
 * day's notice — and it is the same shape as `free_cancel_hours`, so it is a
 * column and an admin control away rather than a redesign.
 */
export const BOOKING_REMINDER_LEAD_MINUTES = 180;

/** Referral discount: invitee gets it on their first order, inviter gets it on their next. */
export const REFERRAL_DISCOUNT_PCT = 2;

/** Maximum combined referral discount a user can stack. */
export const REFERRAL_MAX_STACK_PCT = 25;

/** Demo-only countdown-to-ready duration in seconds; production uses computed `ready_at`. [design] */
export const COUNTDOWN_START_SECONDS = 480;

/** Default guest count preselected on the reservation screen. */
export const DEFAULT_GUESTS = 2;

/** Default reservation time preselected on the reservation screen. */
export const DEFAULT_RESERVE_TIME = '12:30';

/** Price-per-person filter bounds, in AMD. */
export const FILTER_PRICE_RANGE_AMD = [4000, 24000] as const;

/** Distance filter bounds, in km. */
export const DISTANCE_RANGE_KM = [0.5, 5] as const;

/** OTP validity window, in seconds. */
export const OTP_TTL_SECONDS = 120;

// ── Ordering limits ─────────────────────────────────────────────────────────
// [proposed] — no design value exists for these; they are the bounds that keep
// a basket a basket. Confirm with product before launch.

/** Maximum quantity of a single dish in one order. */
export const ORDER_MAX_ITEM_QTY = 20;

/** Maximum number of distinct dishes in one order. */
export const ORDER_MAX_LINES = 50;

/** How far ahead a pre-order may be scheduled, in days. */
export const ORDER_MAX_LEAD_DAYS = 7;

/** Fallback prep estimate when neither the dish nor the branch declares one, in minutes. */
export const DEFAULT_PREP_MIN = 15;

/**
 * How long *before* the kitchen must start cooking a pre-order the branch is
 * reminded, in minutes.
 *
 * `orders.prep_start_at` is the moment work has to begin — `ready_at` minus the
 * prep estimate — and a notification that arrives exactly then is not a warning,
 * it is a deadline that has already passed. This is the slack: time to read it,
 * find the ticket and get to the pass.
 *
 * Separate from the prep estimate on purpose. That number answers "how long does
 * this dish take" and belongs to the food; this one answers "how much notice
 * does a person need" and belongs to the shift. Folding them into one would mean
 * a branch could not lengthen its notice without claiming its dishes cook
 * slower — which would also move the earliest time a customer may order for.
 */
export const PREP_REMINDER_BUFFER_MIN = 10;

/**
 * How long before a pre-order is wanted the branch is warned, in minutes — the
 * number the reminder is actually armed from.
 *
 * Measured from `ready_at`, not from `prep_start_at`, because it is the number a
 * person sets and reads: "warn me forty minutes before it is due" is a sentence
 * somebody can act on, while "warn me ten minutes before the moment the kitchen
 * must start, which is itself thirty minutes before it is due" is the same
 * instant described in a way nobody can hold in their head.
 *
 * The default is the arithmetic that was already there — the prep estimate plus
 * the buffer — so an order nobody touches is warned about at exactly the moment
 * it always was. What changes is that the number is now visible and can be
 * moved.
 */
export function defaultReminderLeadMin(prepMin: number): number {
  return prepMin + PREP_REMINDER_BUFFER_MIN;
}

/**
 * The bounds a branch may move that warning inside, in minutes.
 *
 * The floor is not "as short as you like": under five minutes a reminder is a
 * notification about something already late. The ceiling is a day, which is the
 * longest notice that is still notice — beyond it the reminder stops being a
 * warning and becomes a second copy of the order, and a branch wanting that is
 * asking for the Scheduled tab, which is already there.
 *
 * They are bounds on the *lead*, not on when the reminder lands. A lead longer
 * than the time left before the order is due simply means "warn me now", and the
 * job does exactly that on its next pass — which is the right answer, not an
 * error.
 */
export const REMINDER_LEAD_MIN_MINUTES = 5;
export const REMINDER_LEAD_MAX_MINUTES = 24 * 60;

// ── Table booking ───────────────────────────────────────────────────────────
// [proposed] — the design shows a time picker and a deposit but no policy
// numbers. Confirm with product; they are the answers to "how long is a
// table held" and "when does a deposit stop being refundable".

/**
 * Spacing of the bookable times offered (minutes).
 *
 * **Ten, confirmed by product on 2026-08-08.** It was 30 — read off the
 * design's 12:30 default, and marked proposed above for exactly this reason.
 *
 * This is the *grain of the offer*, not how long anybody keeps the table:
 * `RESERVATION_SEATING_MINUTES` is that, and it is untouched, so 19:00 and
 * 19:10 still collide on one table. What changes is that a guest who wants
 * 19:20 can ask for it. The cost is arithmetic: a twelve-hour day offers about
 * 63 starts instead of 21, so `GET /availability` answers a longer list and the
 * pickers scroll.
 *
 * Nothing validates against a second copy of this: `isSlotBoundary` tests an
 * instant by regenerating the day from `slotsFor`, so what is offered and what
 * is accepted cannot drift apart.
 */
export const RESERVATION_SLOT_MINUTES = 10;

/** How long a table is held for one booking (minutes) — a seating, not an
 *  instant. This is what makes 19:00 and 19:30 conflict on the same table. */
export const RESERVATION_SEATING_MINUTES = 90;

/** Cancel this many hours ahead and the deposit comes back; later it is held. */
export const RESERVATION_FREE_CANCEL_HOURS = 2;

/** How far ahead a table may be booked (days). */
export const RESERVATION_MAX_LEAD_DAYS = 30;

/**
 * Largest party a single table booking may request.
 *
 * **A default now, not a ceiling.** A branch that runs a hall raises it — see
 * `BOOKING_POLICY_LIMITS.maxGuests`, which is where the number a *typo* cannot
 * exceed lives. Twelve remains what a restaurant gets without saying anything,
 * because twelve is what a room full of ordinary tables can seat.
 */
export const RESERVATION_MAX_GUESTS = 12;

/**
 * How close to the sitting a booking may still be made (minutes).
 *
 * New with the configurable policy, and the only one of these numbers that had
 * no previous answer: a table could be claimed a minute before the guest walked
 * in, which is not a booking so much as a surprise for whoever is on the door.
 * An hour is the default because it is roughly the notice a kitchen needs to
 * mean anything, and a branch that wants walk-up bookings sets it to zero.
 */
export const RESERVATION_MIN_LEAD_MINUTES = 60;

/**
 * Whether a booking confirms itself once its deposit is held.
 *
 * True, and deliberately. By the time a booking exists the guest has been
 * charged nothing but has had money held, the server has already picked their
 * table, and nothing about the restaurant's day is waiting on a human decision
 * — so `pending` would be a status that means "we have your money and have not
 * said yes", which is the worst sentence in the flow. A restaurant that wants
 * to read every booking before promising it turns this off per branch.
 */
export const RESERVATION_AUTO_CONFIRM = true;

/**
 * Armenia is UTC+4 all year — it has not observed daylight saving since 2012.
 *
 * A fixed offset is therefore correct *here* and lets slot generation stay
 * arithmetic instead of pulling in a timezone database. It is written down as a
 * constant rather than inlined so that expanding beyond Armenia is a visible
 * change to this line, not a silent hour-off bug in every booking.
 */
export const YEREVAN_UTC_OFFSET_MINUTES = 240;

/** Service window used when a branch has no `open_hours` recorded. [proposed] */
export const DEFAULT_OPEN_HOURS = { opensMinutes: 10 * 60, closesMinutes: 23 * 60 } as const;

// ── Rewards ─────────────────────────────────────────────────────────────────
// [proposed] — the design shows a points balance but no accrual or redemption
// rate. Accrual is implemented at the rate below; **redemption is deliberately
// not**, because inventing a second rate would invent an economy nobody agreed
// to. Confirm both with product before launch.

/** AMD of order subtotal that earns one reward point. */
export const AMD_PER_REWARD_POINT = 100;

/** How long a referral coupon stays usable, in days. */
export const REFERRAL_COUPON_VALID_DAYS = 90;

/** Length of the generated referral code (after the name prefix). */
export const REFERRAL_CODE_LENGTH = 6;

// ── Handover ────────────────────────────────────────────────────────────────

/**
 * Digits in the pickup code — the number a guest shows to collect an order.
 *
 * Six rather than the design's four, because this code stopped being a label
 * and became a proof. It used to be the last four digits of `orders.code`,
 * which meant anybody who had seen the order number — on a receipt, over a
 * shoulder, in a screenshot — already knew it. Now it is generated in its own
 * right, unrelated to the order number, and the counter cannot close an order
 * without being told it.
 *
 * Four digits is 10,000 codes, and `orders.pickup_code` is unique across the
 * whole table rather than per branch, so four would run out and start refusing
 * new orders inside a year of ordinary trade. Six is a million — see
 * DATABASE.md §5 for what happens when *that* fills up, which is a decision
 * somebody has to make rather than a limit anything works around quietly.
 *
 * Here rather than in the API because the panel's handover box validates the
 * same length: a field that accepts five digits and an endpoint that refuses
 * them is a person at a counter typing something twice.
 */
export const PICKUP_CODE_LENGTH = 6;

/** What the pickup code must look like, wherever it is typed or parsed. */
export const PICKUP_CODE_PATTERN = new RegExp(`^\\d{${PICKUP_CODE_LENGTH}}$`);

/**
 * What the API puts in `error.details.reason` when the code typed at the
 * counter is not this order's.
 *
 * A machine-readable reason rather than a sentence, because the panel has to
 * say something specific about this one — it is the ordinary outcome of a
 * mistyped digit, not a failure, and it deserves the panel's own wording in the
 * shift's own language. Every other 422 from that endpoint is shown as the API
 * sent it.
 */
export const HANDOVER_CODE_MISMATCH = 'pickup_code_mismatch';

/**
 * How many dishes one person's meal is, for the "spend per person" filter.
 *
 * There is no stored per-person figure and adding one would mean a
 * denormalised column that every menu edit has to keep in step, so the filter
 * derives it: a branch's typical spend is the average price of its available
 * dishes, times this.
 *
 * **It used to be times nothing**, which is what broke the filter. One dish's
 * average is not what a person spends — it is dragged down by the drinks and
 * the sides, and it put every branch on this platform between 1 480 and 3 900֏
 * while the design drew a slider from 4 000 to 24 000. The two ranges did not
 * overlap, so the control matched everything or nothing wherever it was put,
 * and it was left unbuilt for that reason.
 *
 * Two, because a person orders a main and something with it. It is an
 * approximation and is documented as one — but it is an approximation of the
 * right quantity, which the previous number was not.
 */
export const SPEND_ITEMS_PER_PERSON = 2;

/**
 * The ends of the spend slider, in AMD.
 *
 * Here rather than in the client that draws it, because the API is what decides
 * whether a branch falls inside them: a slider whose ends the server has never
 * heard of is how the first version of this filter came to match nothing. The
 * span covers what the model actually produces on real menus and leaves room
 * above it — the top is a no-op today and is meant to be, since a filter that
 * caps out below the most expensive restaurant on the platform cannot express
 * "anywhere".
 */
export const SPEND_FILTER_MIN_AMD = 2000;
export const SPEND_FILTER_MAX_AMD = 20000;
export const SPEND_FILTER_STEP_AMD = 1000;
