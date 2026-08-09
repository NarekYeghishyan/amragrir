import {
  ACTIVE_RESERVATION_STATUSES,
  DepositOutcome,
  PLATFORM_BOOKING_POLICY,
  RESERVATION_STATUS_FLOW,
  ReservationStatus,
  TERMINAL_RESERVATION_STATUSES,
  canTransitionReservation,
  depositOutcomeFor,
  isReservationCancellable,
  resolveBookingPolicy,
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
  const reservedFor = instantOf('2026-08-01', 19 * 60);

  it('is two hours before the booking', () => {
    const cutoff = freeCancellationUntil(
      { reservedFor, freeCancelHours: null },
      PLATFORM_BOOKING_POLICY,
    );
    expect(reservedFor.getTime() - cutoff.getTime()).toBe(2 * 3_600_000);
  });

  it('falls back to the branch’s policy for a booking that recorded no terms', () => {
    // Rows written before `free_cancel_hours` existed. Nothing recorded their
    // terms, and the resolved policy is what decided them at the time.
    const policy = resolveBookingPolicy({ freeCancelHours: 24 }, null);
    const cutoff = freeCancellationUntil({ reservedFor, freeCancelHours: null }, policy);
    expect(reservedFor.getTime() - cutoff.getTime()).toBe(24 * 3_600_000);
  });

  it('holds the branch to the terms the guest actually agreed to', () => {
    // The booking was taken under a two-hour window; the branch has since moved
    // to twenty-four. The guest keeps the two — a policy change is an offer to
    // whoever books next, not an edit to an agreement somebody already paid on.
    const policy = resolveBookingPolicy({ freeCancelHours: 24 }, null);
    const cutoff = freeCancellationUntil({ reservedFor, freeCancelHours: 2 }, policy);
    expect(reservedFor.getTime() - cutoff.getTime()).toBe(2 * 3_600_000);
  });
});
