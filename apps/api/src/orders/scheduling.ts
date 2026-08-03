import { ORDER_MAX_LEAD_DAYS, defaultReminderLeadMin } from '@amragrir/shared';
import { isWithinOpenHours } from '../common/open-hours';

/**
 * When an order is wanted, when the kitchen must start it, and whether anybody
 * needs warning — see BUSINESS_LOGIC.md §4.
 *
 * Pure, and returning its failures rather than throwing them, for the reason
 * `pricing.ts` is pure: the basket quote and the created order must agree about
 * what times are legal, and the surest way is for both to call the same function
 * with no I/O in it. Mapping a refusal onto an HTTP status is the service's job —
 * a module that reached for `UnprocessableEntityException` could not be reused
 * by the quote, which reports rather than throws.
 */

/**
 * Tolerance when checking a client-supplied `readyAt` against the earliest the
 * kitchen could manage. The client picks a time from the `earliestReadyAt` a
 * quote gave it seconds earlier; without slack, clock skew or the round trip
 * would reject a time the server itself had just offered.
 */
export const READY_AT_SLACK_MS = 60_000;

export interface Schedule {
  /** When the food is promised. */
  readyAt: Date;
  /** When the kitchen has to start — `readyAt` minus the prep estimate. */
  prepStartAt: Date;
  /**
   * When to warn the branch, or **null when the order is for as soon as
   * possible**.
   *
   * Null is not a special case bolted on: it falls out of the arithmetic. The
   * reminder is `readyAt` less the lead below, so for an order wanted at the
   * earliest possible moment it lands in the past — there is nobody to warn
   * about an order the kitchen already has. An order is therefore a *pre-order*
   * exactly when there is still time to warn somebody about it, which is the
   * only definition of "scheduled" this module needs.
   */
  reminderAt: Date | null;
  /**
   * How many minutes before `readyAt` that warning is, or null alongside a null
   * `reminderAt`.
   *
   * The two travel together on purpose. `reminderAt` is the instant a job
   * compares against the clock; this is the number a person set and can read
   * back. Deriving one from the other at the point of use would mean the panel
   * subtracting two timestamps to show a figure the shift typed in.
   */
  reminderLeadMin: number | null;
}

export type ScheduleRefusal =
  | { kind: 'invalid_date' }
  | { kind: 'too_soon'; earliestReadyAt: Date; prepMin: number }
  | { kind: 'too_far'; maxLeadDays: number }
  | { kind: 'closed'; readyAt: Date };

export type ScheduleResult =
  | { ok: true; schedule: Schedule }
  | { ok: false; refusal: ScheduleRefusal };

/**
 * Works out an order's timings, refusing the ones a branch cannot honour.
 *
 * `openHours` is consulted **only for a genuine pre-order** — one far enough
 * ahead that there is still time to warn the kitchen about it. Two kinds of
 * request would otherwise be refused for no good reason: a basket submitted ten
 * minutes before closing whose food is ready five minutes after, which is an
 * ordinary thing to sell; and a client echoing back the `earliestReadyAt` a
 * quote just gave it, which is "as soon as possible" written as a timestamp and
 * is already gated on `branches.is_open`.
 *
 * What the check exists to stop is a pickup booked for 04:00 next Sunday, and
 * that is always far enough ahead to be a pre-order.
 */
export function resolveSchedule(input: {
  requestedReadyAt: string | undefined;
  prepMin: number;
  openHours: unknown;
  now?: Date;
}): ScheduleResult {
  const now = input.now ?? new Date();
  const earliest = new Date(now.getTime() + input.prepMin * 60_000);

  if (input.requestedReadyAt === undefined) {
    return { ok: true, schedule: scheduleFor(earliest, input.prepMin, now) };
  }

  const readyAt = new Date(input.requestedReadyAt);
  if (Number.isNaN(readyAt.getTime())) {
    return { ok: false, refusal: { kind: 'invalid_date' } };
  }
  if (readyAt.getTime() < earliest.getTime() - READY_AT_SLACK_MS) {
    return {
      ok: false,
      refusal: { kind: 'too_soon', earliestReadyAt: earliest, prepMin: input.prepMin },
    };
  }
  if (readyAt.getTime() > now.getTime() + ORDER_MAX_LEAD_DAYS * 24 * 60 * 60_000) {
    return { ok: false, refusal: { kind: 'too_far', maxLeadDays: ORDER_MAX_LEAD_DAYS } };
  }

  const schedule = scheduleFor(readyAt, input.prepMin, now);
  // A pre-order, and only then, has to land inside the branch's hours — see
  // above for why an as-soon-as-possible time is left alone.
  if (schedule.reminderAt !== null && !isWithinOpenHours(input.openHours, readyAt)) {
    return { ok: false, refusal: { kind: 'closed', readyAt } };
  }

  return { ok: true, schedule };
}

function scheduleFor(readyAt: Date, prepMin: number, now: Date): Schedule {
  const leadMin = defaultReminderLeadMin(prepMin);
  const reminderAt = reminderFor(readyAt, leadMin);

  return {
    readyAt,
    prepStartAt: new Date(readyAt.getTime() - prepMin * 60_000),
    // Already passed means there is no warning left to give — see `reminderAt`.
    // The lead follows it rather than standing on its own, so the pair can never
    // be half-set.
    ...(reminderAt.getTime() > now.getTime()
      ? { reminderAt, reminderLeadMin: leadMin }
      : { reminderAt: null, reminderLeadMin: null }),
  };
}

/**
 * The instant a warning falls due, given when the food is wanted and how much
 * notice somebody asked for.
 *
 * One line, exported, because two callers must agree on it: the order that is
 * being placed, and the shift that later moves the lead on an order already
 * placed. A second copy of `readyAt - lead` would be the kind of duplication
 * that stays correct until one side starts counting from `prepStartAt`.
 */
export function reminderFor(readyAt: Date, leadMin: number): Date {
  return new Date(readyAt.getTime() - leadMin * 60_000);
}

/** Whether an order is a pre-order rather than one wanted as soon as possible.
 *  One place, so the API, the board and the panel cannot come to disagree. */
export function isScheduledOrder(reminderAt: Date | null): boolean {
  return reminderAt !== null;
}
