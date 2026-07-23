import {
  ACTIVE_RESERVATION_STATUSES,
  DepositOutcome,
  RESERVATION_STATUS_FLOW,
  ReservationStatus,
  TERMINAL_RESERVATION_STATUSES,
  canTransitionReservation,
  depositOutcomeFor,
  isReservationCancellable,
} from '@amragrir/shared';
import { freeCancellationUntil } from './reservations.service';
import { instantOf } from './slots';

// The reservation machine lives in packages/shared so the API and the owner
// panel cannot drift apart on it (BUSINESS_LOGIC.md §3).

describe('canTransitionReservation', () => {
  it('walks the happy path to a completed visit', () => {
    const path = [
      ReservationStatus.Pending,
      ReservationStatus.Confirmed,
      ReservationStatus.Seated,
      ReservationStatus.Completed,
    ];
    path.slice(0, -1).forEach((from, index) => {
      expect(canTransitionReservation(from, path[index + 1]!)).toBe(true);
    });
  });

  it('only lets a confirmed booking become a no-show', () => {
    // A table nobody promised to hold cannot be a no-show — and the deposit
    // rule depends on that distinction.
    expect(canTransitionReservation(ReservationStatus.Confirmed, ReservationStatus.NoShow)).toBe(
      true,
    );
    expect(canTransitionReservation(ReservationStatus.Pending, ReservationStatus.NoShow)).toBe(
      false,
    );
    expect(canTransitionReservation(ReservationStatus.Seated, ReservationStatus.NoShow)).toBe(
      false,
    );
  });

  it('refuses to skip seating', () => {
    expect(canTransitionReservation(ReservationStatus.Confirmed, ReservationStatus.Completed)).toBe(
      false,
    );
  });

  it('refuses to cancel a guest who is already at the table', () => {
    expect(canTransitionReservation(ReservationStatus.Seated, ReservationStatus.Cancelled)).toBe(
      false,
    );
  });

  it('lets nothing leave a terminal status', () => {
    TERMINAL_RESERVATION_STATUSES.forEach((status) => {
      expect(RESERVATION_STATUS_FLOW[status]).toEqual([]);
    });
  });
});

describe('isReservationCancellable', () => {
  it('agrees with the flow table', () => {
    Object.values(ReservationStatus).forEach((status) => {
      expect(isReservationCancellable(status)).toBe(
        canTransitionReservation(status, ReservationStatus.Cancelled),
      );
    });
  });
});

describe('status buckets', () => {
  it('partition every status exactly once', () => {
    const all = Object.values(ReservationStatus).sort();
    const bucketed = [...ACTIVE_RESERVATION_STATUSES, ...TERMINAL_RESERVATION_STATUSES].sort();
    expect(bucketed).toEqual(all);
  });
});

describe('depositOutcomeFor', () => {
  it('returns the deposit when the guest cancels in time', () => {
    expect(depositOutcomeFor(ReservationStatus.Cancelled, true)).toBe(DepositOutcome.Refund);
  });

  it('keeps it on a late cancellation', () => {
    // The table was held and could not be resold — that is what the deposit
    // is compensating.
    expect(depositOutcomeFor(ReservationStatus.Cancelled, false)).toBe(DepositOutcome.Capture);
  });

  it('keeps it on a no-show regardless of any window', () => {
    expect(depositOutcomeFor(ReservationStatus.NoShow, true)).toBe(DepositOutcome.Capture);
    expect(depositOutcomeFor(ReservationStatus.NoShow, false)).toBe(DepositOutcome.Capture);
  });

  it('credits it when the guest actually ate', () => {
    // BUSINESS_LOGIC §3: credited to the bill, never an extra charge.
    expect(depositOutcomeFor(ReservationStatus.Completed, false)).toBe(DepositOutcome.Credit);
  });
});

describe('freeCancellationUntil', () => {
  it('is two hours before the booking', () => {
    const reservedFor = instantOf('2026-08-01', 19 * 60);
    const cutoff = freeCancellationUntil(reservedFor);
    expect(reservedFor.getTime() - cutoff.getTime()).toBe(2 * 3_600_000);
  });
});
