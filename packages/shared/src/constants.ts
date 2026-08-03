// Numeric business constants — see docs/BUSINESS_LOGIC.md §10 "Key constants (for config)".
// [design] values are demo/prototype values; move to platform/restaurant config before launch
// rather than editing them here in place (see AI_CONTEXT.md "What NOT to do").

/** Fixed service fee per order, in AMD (integer, dram has no minor unit). [design] */
export const SERVICE_FEE_AMD = 360;

/** Table deposit per guest, in AMD. Credited to the final bill, never an extra charge. [design] */
export const DEPOSIT_PER_GUEST_AMD = 2000;

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

/** Spacing of the bookable times offered (minutes). The design's 12:30 default
 *  implies half-hour slots. */
export const RESERVATION_SLOT_MINUTES = 30;

/** How long a table is held for one booking (minutes) — a seating, not an
 *  instant. This is what makes 19:00 and 19:30 conflict on the same table. */
export const RESERVATION_SEATING_MINUTES = 90;

/** Cancel this many hours ahead and the deposit comes back; later it is held. */
export const RESERVATION_FREE_CANCEL_HOURS = 2;

/** How far ahead a table may be booked (days). */
export const RESERVATION_MAX_LEAD_DAYS = 30;

/** Largest party a single table booking may request. */
export const RESERVATION_MAX_GUESTS = 12;

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
