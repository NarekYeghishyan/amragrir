import { RESERVATION_STATUS_FLOW, ReservationStatus } from '@amragrir/shared';
import type { AdminTranslationKey } from '@amragrir/i18n/admin';
import type { ReservationStatusValue, StaffReservation, StaffTable } from './api';

/**
 * The book, as something to reason about without a screen.
 *
 * Two jobs: which buttons a row offers, and where each booking sits on a grid
 * of tables against time. Both are pure, and both are wrong in ways a type
 * check would never catch — an action that leads to a status the API refuses,
 * or a booking drawn on a row it does not belong to.
 */

/** The moves a host actually makes, in the order the buttons read. */
export const BOOKING_ACTIONS: readonly ReservationStatusValue[] = [
  'confirmed',
  'seated',
  'completed',
  'no_show',
  'cancelled',
];

/**
 * Which of those this booking can be moved to.
 *
 * Asked of the shared transition table rather than answered here, so the panel
 * cannot offer a button the API is about to refuse. That table is the same one
 * `canTransitionReservation` enforces server-side — one definition, two
 * readers.
 */
export function actionsFor(status: ReservationStatusValue): ReservationStatusValue[] {
  const allowed = RESERVATION_STATUS_FLOW[status as ReservationStatus] ?? [];
  return BOOKING_ACTIONS.filter((next) => (allowed as readonly string[]).includes(next));
}

/** Whether a booking is still the branch's problem — what the book is *for*. */
export function isLive(status: ReservationStatusValue): boolean {
  return status === 'pending' || status === 'confirmed' || status === 'seated';
}

export const STATUS_LABEL: Record<ReservationStatusValue, AdminTranslationKey> = {
  pending: 'reservationStatus_pending',
  confirmed: 'reservationStatus_confirmed',
  seated: 'reservationStatus_seated',
  completed: 'reservationStatus_completed',
  cancelled: 'reservationStatus_cancelled',
  no_show: 'reservationStatus_no_show',
};

export const ACTION_LABEL: Record<ReservationStatusValue, AdminTranslationKey> = {
  pending: 'bookingActionPending',
  confirmed: 'bookingActionConfirm',
  seated: 'bookingActionSeat',
  completed: 'bookingActionComplete',
  cancelled: 'bookingActionCancel',
  no_show: 'bookingActionNoShow',
};

/**
 * The stage strip above the book, in the order an evening moves through it.
 *
 * The same shape as the order board's `STAGE_TABS` and for the same reason:
 * "which bookings am I looking at" and "how far along are they" are different
 * questions, and answering the second with a strip of tabs is what stops a host
 * scanning forty rows for the three nobody has confirmed.
 *
 * Counted and filtered **here** rather than by the API, which is the one place
 * this differs from the board. The board pages through hundreds and so must ask
 * the server what each stage holds; a book is one day and arrives whole, so the
 * counts are simply arithmetic over what is already on screen. `bookingsPartial`
 * below is what keeps that honest when a day overflows the page.
 *
 * `all` is offered and is where the screen opens, which the board deliberately
 * does *not* do — there, "everything" mixed work nobody had accepted with work
 * sitting on the pass. A book has no such problem: everyone in it is coming
 * today, and the whole point of opening it is to see that list.
 */
export const BOOKING_STAGES = [
  { value: 'all', label: 'bookingStageAll' },
  { value: 'pending', label: 'bookingStagePending' },
  { value: 'confirmed', label: 'bookingStageConfirmed' },
  { value: 'seated', label: 'bookingStageSeated' },
] as const satisfies readonly { value: string; label: AdminTranslationKey }[];

export type BookingStage = (typeof BOOKING_STAGES)[number]['value'];

/** Whether a booking belongs under a stage. `all` holds everything the book
 *  came back with, which is already only the live statuses — the API drops the
 *  finished ones, because a book is who is coming rather than who came. */
export function inStage(status: ReservationStatusValue, stage: BookingStage): boolean {
  return stage === 'all' || status === stage;
}

/** How many of a day's bookings sit under each stage. */
export function stageCounts(
  bookings: readonly StaffReservation[],
): Record<BookingStage, number> {
  const counts = { all: 0, pending: 0, confirmed: 0, seated: 0 } as Record<BookingStage, number>;
  for (const booking of bookings) {
    for (const stage of BOOKING_STAGES) {
      if (inStage(booking.status, stage.value)) {
        counts[stage.value] += 1;
      }
    }
  }
  return counts;
}

/**
 * Whether the day is bigger than the page fetched for it.
 *
 * The counts on the tabs are computed from what arrived, so a day that
 * overflowed would have a strip of numbers that quietly undercount. Said out
 * loud rather than left to be discovered: a tab reading "4" over five bookings
 * is worse than one that admits it is showing part of the day.
 */
export function bookingsPartial(shown: number, total: number): boolean {
  return total > shown;
}

/** Covers — people, not bookings. What a kitchen actually staffs and preps
 *  for, and the one number a book has that the row count does not give. */
export function coversOf(bookings: readonly StaffReservation[]): number {
  return bookings.reduce((sum, booking) => sum + booking.guests, 0);
}

/**
 * Whether the book is narrowed to something, which is what puts the "clear"
 * button in the toolbar and changes what an empty day says.
 *
 * The **date is not a filter**. Every book is a book of some day, so a screen
 * that called today a narrowing would offer to clear it and land on nothing.
 */
export function hasBookingFilters(restaurantId: string, branchId: string): boolean {
  return restaurantId !== '' || branchId !== '';
}

/** The colour a status carries, so the state reads before the word does. */
export function statusTone(status: ReservationStatusValue): 'neutral' | 'accent' | 'good' | 'warn' | 'danger' {
  switch (status) {
    case 'pending':
      return 'warn';
    case 'confirmed':
      return 'accent';
    case 'seated':
      return 'good';
    case 'completed':
      return 'neutral';
    default:
      return 'danger';
  }
}

// ── the grid ────────────────────────────────────────────────────────────────

/**
 * One booking placed on the grid: which table's row, and where along it.
 *
 * `startMinutes` and `endMinutes` are minutes from the **service day's**
 * midnight, so a sitting at 01:00 on a night that began the previous evening
 * lands at 1500 rather than at 60 — to the right of everything else on the row,
 * which is where it belongs and where a host expects to find it.
 */
export interface GridBooking {
  reservation: StaffReservation;
  startMinutes: number;
  endMinutes: number;
}

export interface GridRow {
  table: StaffTable;
  bookings: GridBooking[];
}

/**
 * The span the grid draws, rounded outward to whole hours.
 *
 * Taken from the bookings themselves rather than from the branch's hours: the
 * grid is a picture of one day's book, and a day with two bookings at eight
 * o'clock should not be drawn as thirteen empty hours with a mark in it.
 * Falls back to a plausible evening when the book is empty, so the grid has a
 * shape to be empty *in*.
 */
export function gridSpan(
  bookings: readonly GridBooking[],
  fallback: { from: number; to: number } = { from: 12 * 60, to: 24 * 60 },
): { from: number; to: number } {
  if (bookings.length === 0) {
    return fallback;
  }
  const first = Math.min(...bookings.map((entry) => entry.startMinutes));
  const last = Math.max(...bookings.map((entry) => entry.endMinutes));
  return { from: Math.floor(first / 60) * 60, to: Math.ceil(last / 60) * 60 };
}

/**
 * The book as tables against time.
 *
 * Every table gets a row, including the ones nobody booked — a grid that showed
 * only busy tables would answer "who is coming" while hiding "what is free",
 * and the second is the question somebody standing at the door is asking.
 *
 * A booking whose table has been deleted outright, or which never got one, is
 * returned separately rather than dropped: it is still a guest arriving, and a
 * grid that silently omitted them would be worse than one with an awkward row
 * at the bottom.
 */
export function gridRows(
  tables: readonly StaffTable[],
  bookings: readonly StaffReservation[],
  seatingMinutes: number,
  serviceDate: string,
): { rows: GridRow[]; unplaced: StaffReservation[] } {
  const byTable = new Map<string, GridBooking[]>();
  const unplaced: StaffReservation[] = [];

  for (const reservation of bookings) {
    const table = tables.find((candidate) => candidate.tableNo === reservation.tableNo);
    if (reservation.tableNo === null || table === undefined) {
      unplaced.push(reservation);
      continue;
    }
    const startMinutes = minutesFromServiceMidnight(reservation, serviceDate);
    const placed = byTable.get(table.id) ?? [];
    placed.push({
      reservation,
      startMinutes,
      endMinutes: startMinutes + seatingMinutes,
    });
    byTable.set(table.id, placed);
  }

  const rows = tables.map((table) => ({
    table,
    bookings: (byTable.get(table.id) ?? []).sort((a, b) => a.startMinutes - b.startMinutes),
  }));

  return { rows, unplaced };
}

/**
 * Where a booking sits on the day it belongs to, in minutes.
 *
 * Past midnight it keeps counting: a 01:00 sitting on the night of the 3rd is
 * 1500, not 60. That is the same number line `open_hours` uses for a night that
 * runs past midnight, and it is what keeps the grid in one piece.
 */
export function minutesFromServiceMidnight(
  reservation: { localTime: string; localDate: string },
  serviceDate: string,
): number {
  const [hours, minutes] = reservation.localTime.split(':').map(Number);
  const base = (hours ?? 0) * 60 + (minutes ?? 0);
  return reservation.localDate === serviceDate ? base : base + 24 * 60;
}

/** `HH:MM` for a minute count that may run past 24:00 — `25:30` reads as the
 *  01:30 everybody means. */
export function clockLabel(minutes: number): string {
  const hour = Math.floor(minutes / 60) % 24;
  return `${String(hour).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** The hour marks along the top of the grid. */
export function hourMarks(span: { from: number; to: number }): number[] {
  const marks: number[] = [];
  for (let minute = span.from; minute <= span.to; minute += 60) {
    marks.push(minute);
  }
  return marks;
}

/** Where a booking starts and how wide it is, as percentages of the span —
 *  so the grid scales with the container rather than with a pixel-per-minute
 *  constant that would need a second copy in the stylesheet. */
export function barStyle(
  booking: GridBooking,
  span: { from: number; to: number },
): { left: string; width: string } {
  const total = Math.max(1, span.to - span.from);
  const left = ((booking.startMinutes - span.from) / total) * 100;
  const width = ((booking.endMinutes - booking.startMinutes) / total) * 100;
  return {
    left: `${Math.max(0, Math.min(100, left))}%`,
    width: `${Math.max(1, Math.min(100 - Math.max(0, left), width))}%`,
  };
}

/** Today in Yerevan — what the screen opens on, and what a bare `/bookings`
 *  keeps meaning tomorrow. */
export function todayInYerevan(now: Date = new Date()): string {
  return new Date(now.getTime() + 4 * 3_600_000).toISOString().slice(0, 10);
}

/** The day before or after, staying on `YYYY-MM-DD`. The arrows either side of
 *  the date are how a host actually moves through the book. */
export function shiftDate(date: string, days: number): string {
  return new Date(new Date(`${date}T00:00:00.000Z`).getTime() + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}
