// How the numbers behind a booking are decided — see docs/BUSINESS_LOGIC.md §3.
//
// Every rule here used to be a constant in `constants.ts`, identical for a wine
// bar with four tables and a hall that seats a hundred. They are still those
// constants; what changed is that a restaurant, and then one of its branches,
// may disagree with any of them field by field.
//
// **The resolution happens here and nowhere else.** The availability calendar,
// the endpoint that accepts a booking, the back office that edits the settings
// and the tests all ask this one function. That is the same discipline
// `slotsFor` already enforces on the times themselves: what is offered and what
// is accepted have to be computed by one piece of code, or a guest is shown a
// slot the server then refuses.

import {
  DEPOSIT_PER_GUEST_AMD,
  RESERVATION_FREE_CANCEL_HOURS,
  RESERVATION_MAX_GUESTS,
  RESERVATION_MAX_LEAD_DAYS,
  RESERVATION_MIN_LEAD_MINUTES,
  RESERVATION_SEATING_MINUTES,
  RESERVATION_SLOT_MINUTES,
  RESERVATION_AUTO_CONFIRM,
} from './constants';

/**
 * One level's answers, where `null` means "not answered here".
 *
 * Every field is nullable and none of them defaults, because at this layer
 * there is no such thing as a default — a level either has an opinion or hands
 * the question upwards. The defaults live in `PLATFORM_BOOKING_POLICY`, at the
 * top of the chain, where they are the last word rather than a value anybody
 * else has to carry.
 */
export interface BookingPolicyFields {
  /** How long one booking holds its table, in minutes. */
  seatingMinutes: number | null;
  /** Spacing of the times offered, in minutes. */
  slotMinutes: number | null;
  /** Largest party one booking may ask for. */
  maxGuests: number | null;
  /** How far ahead the calendar runs, in days. */
  maxLeadDays: number | null;
  /** How close to the sitting a booking may still be made, in minutes. */
  minLeadMinutes: number | null;
  /** Deposit per guest, in AMD. */
  depositPerGuestAmd: number | null;
  /** Cancel this many hours ahead and the deposit comes back. */
  freeCancelHours: number | null;
  /** Whether a paid booking confirms itself. */
  autoConfirm: boolean | null;
}

/** The same answers with every question settled — what a caller actually uses. */
export type ResolvedBookingPolicy = {
  [K in keyof BookingPolicyFields]: NonNullable<BookingPolicyFields[K]>;
};

/**
 * The platform's answers, and the bottom of every fallback chain.
 *
 * Still the constants that were here before, referenced rather than re-typed:
 * a number in two places is a number that will eventually differ, and the
 * clients import several of these directly.
 */
export const PLATFORM_BOOKING_POLICY: ResolvedBookingPolicy = {
  seatingMinutes: RESERVATION_SEATING_MINUTES,
  slotMinutes: RESERVATION_SLOT_MINUTES,
  maxGuests: RESERVATION_MAX_GUESTS,
  maxLeadDays: RESERVATION_MAX_LEAD_DAYS,
  minLeadMinutes: RESERVATION_MIN_LEAD_MINUTES,
  depositPerGuestAmd: DEPOSIT_PER_GUEST_AMD,
  freeCancelHours: RESERVATION_FREE_CANCEL_HOURS,
  autoConfirm: RESERVATION_AUTO_CONFIRM,
};

/** The fields, in the order a form shows them and a test iterates them. */
export const BOOKING_POLICY_FIELDS = Object.keys(
  PLATFORM_BOOKING_POLICY,
) as readonly (keyof BookingPolicyFields)[];

/**
 * What a field may be set to — refused by the DTO, and by the panel before that.
 *
 * These are **not** business judgements about what a good seating length is.
 * They are the range outside which a number is a typo: a 5-minute seating and a
 * 10-hour one are both things somebody could mean, and a 5000-minute one is a
 * slipped finger. Where a restaurant's real answer sits inside this range is
 * the restaurant's business.
 *
 * `maxGuests` is the one worth naming. It reaches 200 because a hall that seats
 * a hundred is a real thing to run, and the platform's job is to let the admin
 * say so — not to decide on their behalf that parties stop at twelve.
 */
export const BOOKING_POLICY_LIMITS: Readonly<
  Record<keyof Omit<BookingPolicyFields, 'autoConfirm'>, { min: number; max: number }>
> = {
  seatingMinutes: { min: 30, max: 480 },
  slotMinutes: { min: 5, max: 120 },
  maxGuests: { min: 1, max: 200 },
  maxLeadDays: { min: 1, max: 365 },
  minLeadMinutes: { min: 0, max: 1440 },
  depositPerGuestAmd: { min: 0, max: 100_000 },
  freeCancelHours: { min: 0, max: 168 },
};

/** Nothing answered — what a level with no stored row means. */
export const UNSET_BOOKING_POLICY: BookingPolicyFields = {
  seatingMinutes: null,
  slotMinutes: null,
  maxGuests: null,
  maxLeadDays: null,
  minLeadMinutes: null,
  depositPerGuestAmd: null,
  freeCancelHours: null,
  autoConfirm: null,
};

/**
 * The rules in force at one branch.
 *
 * Field by field: the branch's answer, else the restaurant's, else the
 * platform's. Not row by row — a branch that overrides only its seating length
 * goes on inheriting the chain's deposit, and a chain that raises its deposit
 * moves that branch with it. Whole-row precedence would mean touching one field
 * silently froze the other seven at whatever they happened to be that day.
 *
 * `null` for a level is the same as a level that answered nothing, so a caller
 * with no stored row passes `null` rather than constructing an empty one.
 *
 * A pure function over plain fields, with no Prisma types in the signature:
 * this package is imported by the phone, the web app and the panel, and the
 * back office resolves the same chain to show what a branch would inherit if it
 * stopped overriding.
 */
export function resolveBookingPolicy(
  branch: Partial<BookingPolicyFields> | null | undefined,
  restaurant: Partial<BookingPolicyFields> | null | undefined,
): ResolvedBookingPolicy {
  const pick = <K extends keyof BookingPolicyFields>(field: K): ResolvedBookingPolicy[K] =>
    (branch?.[field] ?? restaurant?.[field] ?? PLATFORM_BOOKING_POLICY[field]) as
      ResolvedBookingPolicy[K];

  return {
    seatingMinutes: pick('seatingMinutes'),
    slotMinutes: pick('slotMinutes'),
    maxGuests: pick('maxGuests'),
    maxLeadDays: pick('maxLeadDays'),
    minLeadMinutes: pick('minLeadMinutes'),
    depositPerGuestAmd: pick('depositPerGuestAmd'),
    freeCancelHours: pick('freeCancelHours'),
    autoConfirm: pick('autoConfirm'),
  };
}

/**
 * Which level each answer came from — what the settings screen greys out.
 *
 * The panel has to show three things at once: what this branch decided, what it
 * would inherit if it stopped deciding, and which of the two is currently in
 * force. Without this a form can only show the resolved number, and a manager
 * cannot tell a deliberate 90 from an inherited one — so they set it again to
 * be sure, and the branch acquires an override nobody wanted, which then stops
 * following the chain forever.
 */
export type PolicySource = 'branch' | 'restaurant' | 'platform';

export function bookingPolicySources(
  branch: Partial<BookingPolicyFields> | null | undefined,
  restaurant: Partial<BookingPolicyFields> | null | undefined,
): Record<keyof BookingPolicyFields, PolicySource> {
  const source = (field: keyof BookingPolicyFields): PolicySource => {
    if (branch?.[field] !== null && branch?.[field] !== undefined) {
      return 'branch';
    }
    if (restaurant?.[field] !== null && restaurant?.[field] !== undefined) {
      return 'restaurant';
    }
    return 'platform';
  };

  return Object.fromEntries(BOOKING_POLICY_FIELDS.map((field) => [field, source(field)])) as Record<
    keyof BookingPolicyFields,
    PolicySource
  >;
}

/**
 * The deposit for a party under a given policy.
 *
 * Credited against the final bill, never an extra charge — it scales with the
 * party because the cost of an empty table does.
 */
export function depositForGuests(guests: number, policy: ResolvedBookingPolicy): number {
  return guests * policy.depositPerGuestAmd;
}
