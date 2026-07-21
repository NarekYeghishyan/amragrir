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
