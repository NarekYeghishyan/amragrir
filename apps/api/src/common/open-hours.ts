import { DEFAULT_OPEN_HOURS, YEREVAN_UTC_OFFSET_MINUTES } from '@amragrir/shared';

/**
 * When a branch is open, and what a local time means.
 *
 * Here rather than in `reservations/slots.ts`, where it started, because opening
 * hours belong to a **branch** and two modules now ask about them: a booking has
 * to fall inside the service window, and so does the moment a pre-order is
 * collected. A second copy in `orders/` would be the same rule written twice,
 * and the symptom would be a branch that refuses a 22:45 table and accepts a
 * 22:45 pickup.
 *
 * Pure functions with no I/O, for the reason the slot arithmetic is: the same
 * rules answer "which times may I offer?" and "is this time legal?", and a time
 * the picker showed which the server then rejects is the worst outcome here.
 *
 * **All local times are Yerevan.** The stored columns are timestamptz, so they
 * are absolute instants; a customer picking "19:00" means 19:00 where the
 * restaurant is. Working in UTC would offer 10:00 UTC — 14:00 to them.
 */

/** Minutes in a day. Named because closing times are allowed to exceed it. */
export const MINUTES_PER_DAY = 1440;

/** Minutes since local midnight for an instant, in Yerevan time. */
export function localMinutesOf(instant: Date): number {
  const shifted = new Date(instant.getTime() + YEREVAN_UTC_OFFSET_MINUTES * 60_000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

/**
 * The instant of `HH:MM` local time on `date` (`YYYY-MM-DD`, local calendar).
 *
 * `minutesOfDay` may exceed 1440, which is how a time after midnight on a
 * night that began the previous evening is addressed — 02:00 on the night of
 * the 3rd is `instantOf('2026-08-03', 1560)`, not a time on the 4th.
 */
export function instantOf(date: string, minutesOfDay: number): Date {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const localMidnightUtc = Date.UTC(year, month - 1, day);
  return new Date(localMidnightUtc + (minutesOfDay - YEREVAN_UTC_OFFSET_MINUTES) * 60_000);
}

/** `HH:MM` in Yerevan time — what a picker displays. */
export function localTimeLabel(instant: Date): string {
  const minutes = localMinutesOf(instant);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** The local calendar date (`YYYY-MM-DD`) an instant falls on in Yerevan. */
export function localDateOf(instant: Date): string {
  return new Date(instant.getTime() + YEREVAN_UTC_OFFSET_MINUTES * 60_000)
    .toISOString()
    .slice(0, 10);
}

/**
 * A `YYYY-MM-DD` as a Postgres `DATE` column holds it — midnight UTC, no zone.
 *
 * A date column is a calendar square rather than an instant, so the *only*
 * correct way to address it is midnight UTC; building the same value with
 * `new Date('2026-08-12')` in a local-time context lands four hours off in
 * Yerevan and reads back as the 11th.
 */
export function dateOnly(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** A local calendar date moved by whole days, still `YYYY-MM-DD`. */
export function addLocalDays(date: string, days: number): string {
  return new Date(new Date(`${date}T00:00:00.000Z`).getTime() + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

export interface OpenWindow {
  opensMinutes: number;
  /**
   * Minutes from the *opening day's* midnight, so a night that ends after
   * midnight closes past 1440 — 12:00–02:00 reads as 720 to 1560.
   *
   * This is what makes a late-night restaurant expressible at all. Held as one
   * number line rather than as a flag plus a wrapped time, so every piece of
   * arithmetic downstream — the slot loop, the last-start subtraction, the
   * containment test — keeps working by ordinary comparison.
   */
  closesMinutes: number;
}

/**
 * One dated exception to a branch's usual week — a `branch_closures` row, in
 * the shape this module needs rather than the shape Prisma returns.
 *
 * Passed in rather than read here, because everything in this file is a pure
 * function and intends to stay one: the caller does the query, this decides
 * what the answer means.
 */
export interface DatedClosure {
  kind: 'closed' | 'custom_hours';
  opensMinutes: number | null;
  closesMinutes: number | null;
}

/**
 * A window with its closing time on the same number line as its opening one.
 *
 * `close <= open` is how a day that ends after midnight is written — 12:00 to
 * 02:00 — and it used to produce a window whose loop body never ran, so a
 * late-night restaurant was offered **zero** bookable times and nothing said
 * why. Equal times are read the same way, which makes `00:00–00:00` the whole
 * day rather than an instant; that is the convention every roster in the world
 * uses, and the alternative reading is a window nobody would ever mean.
 */
function normalized(opensMinutes: number, closesMinutes: number): OpenWindow {
  return {
    opensMinutes,
    closesMinutes: closesMinutes <= opensMinutes ? closesMinutes + MINUTES_PER_DAY : closesMinutes,
  };
}

/**
 * What one hours document says about the day an instant falls on.
 *
 * Three answers, and the third is why this is separate from `openWindowFor`:
 * `undefined` means *this document does not answer for that day*, which is
 * different from `null` — an explicit closure — and different again from a
 * window. `booking_hours` needs the distinction to fall through to `open_hours`
 * while still being able to say "closed on Mondays" itself.
 *
 * Shape accepted: `{ "mon": { "open": "10:00", "close": "23:00" }, … }`, plus
 * `{ "default": … }`.
 */
function windowFromHours(hours: unknown, instant: Date): OpenWindow | null | undefined {
  const record = hours as Record<string, unknown> | null | undefined;
  if (!record || typeof record !== 'object') {
    return undefined;
  }

  const weekday = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][
    new Date(instant.getTime() + YEREVAN_UTC_OFFSET_MINUTES * 60_000).getUTCDay()
  ]!;

  const entry = (record[weekday] ?? record.default) as
    | { open?: string; close?: string; closed?: boolean }
    | undefined;

  if (!entry) {
    return undefined;
  }
  if (entry.closed === true) {
    // An explicit closed day is a real answer, not a missing one.
    return null;
  }

  const opens = parseHhMm(entry.open);
  const closes = parseHhMm(entry.close);
  if (opens === null || closes === null) {
    return undefined;
  }
  return normalized(opens, closes);
}

/**
 * Reads a branch's hours for a given weekday out of the `open_hours` JSON,
 * falling back to a default service window. Null means the branch is shut that
 * day.
 *
 * Anything the document does not answer — a missing column, a day it does not
 * name and no `default`, a malformed time — resolves to `DEFAULT_OPEN_HOURS`.
 * That is deliberately generous: these hours gate *pickup* as well as bookings,
 * and refusing a branch's orders because nobody filled in a JSON column would
 * be a worse failure than assuming the usual day.
 */
export function openWindowFor(openHours: unknown, instant: Date): OpenWindow | null {
  const window = windowFromHours(openHours, instant);
  if (window === undefined) {
    return normalized(DEFAULT_OPEN_HOURS.opensMinutes, DEFAULT_OPEN_HOURS.closesMinutes);
  }
  return window;
}

/**
 * When this branch takes **bookings** on the day an instant falls on.
 *
 * The one function the booking calendar and the endpoint that accepts a booking
 * both ask, so what is offered and what is accepted cannot come from different
 * readings of the same four sources. In order:
 *
 * 1. **A dated closure**, if one exists for that day. It is the most specific
 *    thing anybody said, and it is said about this exact date.
 * 2. **`booking_hours`**, when the branch keeps different hours for holding a
 *    table than for serving food.
 * 3. **`open_hours`** — most kitchens book every hour they are open, and should
 *    not have to restate their week to say so.
 * 4. The platform default, on the same generous grounds as `openWindowFor`.
 *
 * Note the fall-through only skips a level that said *nothing*. A
 * `booking_hours` document that marks Monday closed closes Monday, rather than
 * deferring to an `open_hours` that has the kitchen working.
 */
export function bookingWindowFor(
  branch: { openHours: unknown; bookingHours?: unknown },
  instant: Date,
  closure?: DatedClosure | null,
): OpenWindow | null {
  if (closure) {
    if (closure.kind === 'closed') {
      return null;
    }
    if (closure.opensMinutes !== null && closure.closesMinutes !== null) {
      return normalized(closure.opensMinutes, closure.closesMinutes);
    }
    // A `custom_hours` row with no hours on it cannot happen — a CHECK
    // constraint forbids it — so this falls through rather than inventing a
    // window, and the day reads as an ordinary one.
  }

  const booking = windowFromHours(branch.bookingHours, instant);
  if (booking !== undefined) {
    return booking;
  }

  return openWindowFor(branch.openHours, instant);
}

/**
 * The date whose *service day* an instant belongs to.
 *
 * For almost every branch this is simply the instant's own local date. It
 * differs for a night that runs past midnight: 01:30 on Tuesday belongs to
 * Monday's shift, and answering "Tuesday" would put that booking at the head of
 * the wrong day's list, gate it against the wrong day's hours, and count its
 * money in the wrong shift's takings.
 *
 * Resolved by asking whether the *previous* day's window actually reaches this
 * instant, rather than by assuming any hour before opening belongs to
 * yesterday — a branch that shuts at 23:00 has no claim on 01:30, and its
 * bookings should not be quietly re-dated because somebody once worked late.
 */
export function serviceDateOf(
  branch: { openHours: unknown; bookingHours?: unknown },
  instant: Date,
  /** The previous day's dated exception, if it has one — a branch that closed
   *  early last night has no claim on this morning's small hours. */
  previousDayClosure?: DatedClosure | null,
): string {
  const own = localDateOf(instant);
  const previous = addLocalDays(own, -1);

  // Noon on the previous day, purely to name that day to the weekday lookup.
  const yesterday = bookingWindowFor(branch, instantOf(previous, 12 * 60), previousDayClosure);
  if (yesterday && yesterday.closesMinutes > MINUTES_PER_DAY) {
    const minutes = localMinutesOf(instant) + MINUTES_PER_DAY;
    if (minutes >= yesterday.opensMinutes && minutes <= yesterday.closesMinutes) {
      return previous;
    }
  }

  return own;
}

/** Whether a minute-of-day falls inside a window, counting a night that runs
 *  past midnight as part of the day it started on. */
export function windowContains(window: OpenWindow, minutesOfDay: number): boolean {
  const inRange = (minutes: number) =>
    minutes >= window.opensMinutes && minutes <= window.closesMinutes;
  return inRange(minutesOfDay) || inRange(minutesOfDay + MINUTES_PER_DAY);
}

/** Whether an instant falls inside the branch's service window for its own day. */
export function isWithinOpenHours(openHours: unknown, instant: Date): boolean {
  const window = openWindowFor(openHours, instant);
  if (window === null) {
    return false;
  }
  return windowContains(window, localMinutesOf(instant));
}

function parseHhMm(value: string | undefined): number | null {
  if (typeof value !== 'string') {
    return null;
  }
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours <= 24 && minutes < 60 ? hours * 60 + minutes : null;
}
