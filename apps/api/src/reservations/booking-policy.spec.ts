import {
  BOOKING_POLICY_FIELDS,
  BOOKING_POLICY_LIMITS,
  PLATFORM_BOOKING_POLICY,
  RESERVATION_MAX_GUESTS,
  RESERVATION_SEATING_MINUTES,
  UNSET_BOOKING_POLICY,
  bookingPolicySources,
  resolveBookingPolicy,
} from '@amragrir/shared';

/**
 * The inheritance chain behind every booking number — BUSINESS_LOGIC.md §3.
 *
 * Lives in the API package because `@amragrir/shared` has no test runner of its
 * own; `service-offering.spec.ts` tests its sibling resolver from here for the
 * same reason.
 */

describe('resolveBookingPolicy', () => {
  it('answers with the platform’s numbers when nobody has overridden anything', () => {
    // The property the whole migration rests on: a database that has just run
    // it resolves to exactly the constants it resolved to before.
    expect(resolveBookingPolicy(null, null)).toEqual(PLATFORM_BOOKING_POLICY);
    expect(resolveBookingPolicy(UNSET_BOOKING_POLICY, UNSET_BOOKING_POLICY)).toEqual(
      PLATFORM_BOOKING_POLICY,
    );
  });

  it('lets a restaurant answer for all of its branches', () => {
    const resolved = resolveBookingPolicy(null, { depositPerGuestAmd: 5000 });
    expect(resolved.depositPerGuestAmd).toBe(5000);
    expect(resolved.seatingMinutes).toBe(RESERVATION_SEATING_MINUTES);
  });

  it('lets a branch disagree with its own chain', () => {
    const resolved = resolveBookingPolicy({ seatingMinutes: 120 }, { seatingMinutes: 90 });
    expect(resolved.seatingMinutes).toBe(120);
  });

  it('resolves field by field, not row by row', () => {
    // The failure this prevents: a branch that overrides one number stops
    // following the chain on the other seven, freezing them at whatever they
    // happened to be the day somebody touched the form.
    const resolved = resolveBookingPolicy(
      { seatingMinutes: 120 },
      { depositPerGuestAmd: 5000, maxGuests: 40 },
    );

    expect(resolved.seatingMinutes).toBe(120);
    expect(resolved.depositPerGuestAmd).toBe(5000);
    expect(resolved.maxGuests).toBe(40);
    expect(resolved.slotMinutes).toBe(PLATFORM_BOOKING_POLICY.slotMinutes);
  });

  it('treats an override equal to the inherited value as an override', () => {
    // Deliberate: somebody typed 90 to mean "90 whatever the chain does later".
    // It matters the day the platform's default moves — this branch must not.
    const branch = { seatingMinutes: RESERVATION_SEATING_MINUTES };
    expect(bookingPolicySources(branch, null).seatingMinutes).toBe('branch');
  });

  it('does not mistake a false for an absent answer', () => {
    // `autoConfirm` is the only boolean here, and `??` is what makes "off" a
    // real answer rather than a silence that inherits `true`.
    expect(resolveBookingPolicy({ autoConfirm: false }, null).autoConfirm).toBe(false);
    expect(resolveBookingPolicy(null, { autoConfirm: false }).autoConfirm).toBe(false);
    expect(resolveBookingPolicy(null, null).autoConfirm).toBe(true);
  });

  it('does not mistake a zero for an absent answer', () => {
    // A branch taking walk-up bookings sets the notice period to zero, and zero
    // must not read as "inherit the platform's hour".
    expect(resolveBookingPolicy({ minLeadMinutes: 0 }, null).minLeadMinutes).toBe(0);
    expect(resolveBookingPolicy({ depositPerGuestAmd: 0 }, null).depositPerGuestAmd).toBe(0);
  });

  it('settles every field it knows about', () => {
    const resolved = resolveBookingPolicy(null, null) as Record<string, unknown>;
    for (const field of BOOKING_POLICY_FIELDS) {
      expect(resolved[field]).not.toBeUndefined();
      expect(resolved[field]).not.toBeNull();
    }
  });
});

describe('bookingPolicySources', () => {
  it('names where each answer came from', () => {
    // What lets the settings screen grey out an inherited value instead of
    // showing a number a manager cannot tell from a decision.
    const sources = bookingPolicySources({ seatingMinutes: 120 }, { maxGuests: 40 });

    expect(sources.seatingMinutes).toBe('branch');
    expect(sources.maxGuests).toBe('restaurant');
    expect(sources.slotMinutes).toBe('platform');
  });
});

describe('BOOKING_POLICY_LIMITS', () => {
  it('lets an admin book a hall, not just a table', () => {
    // The answer to "can we take an event for a hundred": yes, if the admin
    // says so. Twelve stays the default, and is no longer the ceiling.
    expect(BOOKING_POLICY_LIMITS.maxGuests.max).toBeGreaterThanOrEqual(100);
    expect(PLATFORM_BOOKING_POLICY.maxGuests).toBe(RESERVATION_MAX_GUESTS);
  });

  it('keeps every platform default inside its own limits', () => {
    // A default outside the range the form accepts would be a number nobody
    // could re-enter after clearing the field.
    for (const [field, range] of Object.entries(BOOKING_POLICY_LIMITS)) {
      const value = PLATFORM_BOOKING_POLICY[field as keyof typeof BOOKING_POLICY_LIMITS];
      expect(value).toBeGreaterThanOrEqual(range.min);
      expect(value).toBeLessThanOrEqual(range.max);
    }
  });
});
