// The reservation state machine — see docs/BUSINESS_LOGIC.md §3.
//
// Lives here rather than in the API for the same reason as the order flow:
// the owner panel decides which buttons to render from this table, so a second
// copy would drift from the one the server enforces.

import { ReservationStatus } from './enums';

/** Every status a reservation may move to from a given status. */
export const RESERVATION_STATUS_FLOW: Readonly<
  Record<ReservationStatus, readonly ReservationStatus[]>
> = {
  [ReservationStatus.Pending]: [ReservationStatus.Confirmed, ReservationStatus.Cancelled],
  // `no_show` is only reachable from `confirmed`: a table nobody promised to
  // hold cannot be a no-show, and the deposit rule depends on that distinction.
  [ReservationStatus.Confirmed]: [
    ReservationStatus.Seated,
    ReservationStatus.Cancelled,
    ReservationStatus.NoShow,
  ],
  [ReservationStatus.Seated]: [ReservationStatus.Completed],
  [ReservationStatus.Completed]: [],
  [ReservationStatus.Cancelled]: [],
  [ReservationStatus.NoShow]: [],
} as const;

/** Statuses a guest may still cancel from. */
export const CANCELLABLE_RESERVATION_STATUSES: readonly ReservationStatus[] = [
  ReservationStatus.Pending,
  ReservationStatus.Confirmed,
];

/** Statuses that still hold a table, so they block the slot and show in "upcoming". */
export const ACTIVE_RESERVATION_STATUSES: readonly ReservationStatus[] = [
  ReservationStatus.Pending,
  ReservationStatus.Confirmed,
  ReservationStatus.Seated,
];

/** Statuses a reservation can no longer move out of. */
export const TERMINAL_RESERVATION_STATUSES: readonly ReservationStatus[] = [
  ReservationStatus.Completed,
  ReservationStatus.Cancelled,
  ReservationStatus.NoShow,
];

export function canTransitionReservation(
  from: ReservationStatus,
  to: ReservationStatus,
): boolean {
  return RESERVATION_STATUS_FLOW[from].includes(to);
}

export function isReservationCancellable(status: ReservationStatus): boolean {
  return CANCELLABLE_RESERVATION_STATUSES.includes(status);
}

/**
 * What happens to the deposit when a reservation ends.
 *
 * The money question is the whole point of a deposit, so it is answered by one
 * function both the cancel path and the owner panel call — not by an `if` in
 * each place that could disagree about a no-show.
 *
 * - `refund` — the guest gets it back (cancelled in time).
 * - `capture` — the restaurant keeps it (late cancellation or no-show); it
 *   compensates the table nobody sat at.
 * - `credit` — the guest ate, so it comes off the bill rather than being an
 *   extra charge (BUSINESS_LOGIC.md §3).
 */
export const DepositOutcome = {
  Refund: 'refund',
  Capture: 'capture',
  Credit: 'credit',
} as const;
export type DepositOutcome = (typeof DepositOutcome)[keyof typeof DepositOutcome];

export function depositOutcomeFor(
  status: ReservationStatus,
  cancelledInsideFreeWindow: boolean,
): DepositOutcome {
  if (status === ReservationStatus.Completed) {
    return DepositOutcome.Credit;
  }
  if (status === ReservationStatus.NoShow) {
    return DepositOutcome.Capture;
  }
  // Cancelled: free up to the cutoff, held after it.
  return cancelledInsideFreeWindow ? DepositOutcome.Refund : DepositOutcome.Capture;
}
