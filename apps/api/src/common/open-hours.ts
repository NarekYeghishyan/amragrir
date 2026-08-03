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

export interface OpenWindow {
  opensMinutes: number;
  closesMinutes: number;
}

/**
 * Reads a branch's hours for a given weekday out of the `open_hours` JSON,
 * falling back to a default service window. Null means the branch is shut that
 * day.
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

/** Whether an instant falls inside the branch's service window for its own day. */
export function isWithinOpenHours(openHours: unknown, instant: Date): boolean {
  const window = openWindowFor(openHours, instant);
  if (window === null) {
    return false;
  }
  const minutes = localMinutesOf(instant);
  return minutes >= window.opensMinutes && minutes <= window.closesMinutes;
}
