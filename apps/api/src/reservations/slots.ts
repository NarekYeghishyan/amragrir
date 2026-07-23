import {
  DEFAULT_OPEN_HOURS,
  DEPOSIT_PER_GUEST_AMD,
  RESERVATION_SEATING_MINUTES,
  RESERVATION_SLOT_MINUTES,
  YEREVAN_UTC_OFFSET_MINUTES,
} from '@amragrir/shared';

/**
 * Slot arithmetic for table booking.
 *
 * Pure functions with no I/O, because the same rules answer two questions that
 * must never disagree: "which times may I offer?" (availability) and "is this
 * time legal?" (booking). A slot the picker showed and the server then rejects
 * is the worst possible outcome here.
 *
 * **All local times are Yerevan.** `reserved_for` is a timestamptz, so it is an
 * absolute instant; a guest picking "19:00" means 19:00 where the restaurant
 * is. Generating slots in UTC would offer 10:00 UTC — 14:00 to the guest.
 */

/** Minutes since local midnight for an instant, in Yerevan time. */
export function localMinutesOf(instant: Date): number {
  const shifted = new Date(instant.getTime() + YEREVAN_UTC_OFFSET_MINUTES * 60_000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

/** The instant of `HH:MM` local time on `date` (`YYYY-MM-DD`, local calendar). */
export function instantOf(date: string, minutesOfDay: number): Date {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const localMidnightUtc = Date.UTC(year, month - 1, day);
  return new Date(localMidnightUtc + (minutesOfDay - YEREVAN_UTC_OFFSET_MINUTES) * 60_000);
}

/** `HH:MM` in Yerevan time — what the picker displays. */
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

export interface OpenWindow {
  opensMinutes: number;
  closesMinutes: number;
}

/**
 * Reads a branch's hours for a given weekday out of the `open_hours` JSON,
 * falling back to a default service window.
 *
 * Shape accepted: `{ "mon": { "open": "10:00", "close": "23:00" }, … }`, plus
 * `{ "default": … }`. Nothing writes this column yet, so the fallback is the
 * live path — it is a documented default, not a guess hidden in a branch.
 */
export function openWindowFor(openHours: unknown, instant: Date): OpenWindow | null {
  const record = openHours as Record<string, unknown> | null | undefined;
  if (!record || typeof record !== 'object') {
    return { ...DEFAULT_OPEN_HOURS };
  }

  const weekday = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][
    new Date(instant.getTime() + YEREVAN_UTC_OFFSET_MINUTES * 60_000).getUTCDay()
  ]!;

  const entry = (record[weekday] ?? record.default) as
    | { open?: string; close?: string; closed?: boolean }
    | undefined;

  if (!entry || entry.closed === true) {
    // An explicit closed day is a real answer, not a missing one.
    return entry?.closed === true ? null : { ...DEFAULT_OPEN_HOURS };
  }

  const opens = parseHhMm(entry.open);
  const closes = parseHhMm(entry.close);
  if (opens === null || closes === null) {
    return { ...DEFAULT_OPEN_HOURS };
  }
  return { opensMinutes: opens, closesMinutes: closes };
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

/**
 * Bookable start times for a local date.
 *
 * The last slot is one whole seating before closing: offering 22:30 when the
 * kitchen shuts at 23:00 sells a table the guest cannot use.
 */
export function slotsFor(date: string, window: OpenWindow): Date[] {
  const lastStart = window.closesMinutes - RESERVATION_SEATING_MINUTES;
  const slots: Date[] = [];

  for (
    let minutes = window.opensMinutes;
    minutes <= lastStart;
    minutes += RESERVATION_SLOT_MINUTES
  ) {
    slots.push(instantOf(date, minutes));
  }
  return slots;
}

/** Whether an instant is exactly on a bookable slot boundary for its date. */
export function isSlotBoundary(instant: Date, window: OpenWindow): boolean {
  return slotsFor(localDateOf(instant), window).some(
    (slot) => slot.getTime() === instant.getTime(),
  );
}

/** Two seatings on one table clash when their intervals overlap at all. */
export function seatingsOverlap(a: Date, b: Date): boolean {
  const gap = Math.abs(a.getTime() - b.getTime());
  return gap < RESERVATION_SEATING_MINUTES * 60_000;
}

/** The window a booking at `start` occupies, for querying existing bookings. */
export function seatingRange(start: Date): { from: Date; to: Date } {
  const seating = RESERVATION_SEATING_MINUTES * 60_000;
  return { from: new Date(start.getTime() - seating), to: new Date(start.getTime() + seating) };
}

/**
 * Deposit for a party — see BUSINESS_LOGIC.md §3.
 *
 * Credited against the final bill, never an extra charge. It scales with the
 * party because the cost of an empty table does.
 */
export function depositFor(guests: number): number {
  return guests * DEPOSIT_PER_GUEST_AMD;
}
