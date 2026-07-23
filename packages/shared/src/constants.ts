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
