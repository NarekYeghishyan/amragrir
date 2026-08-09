import {
  PickupOption,
  RestaurantService,
  acceptsPickupOption,
  canonicalServices,
  checkServices,
  eatInRequiresBooking,
  pickupOptionsFor,
  seatsWalkIns,
  serviceToggleBreach,
  takesBookings,
  toggleService,
} from '@amragrir/shared';

/**
 * The rules in BUSINESS_LOGIC.md §2, as a table.
 *
 * The rules live in `@amragrir/shared` because four codebases enforce them —
 * the endpoint below, the back office's switches, and both customer clients —
 * and their test lives here, beside the enforcement, because `packages/shared`
 * has no runner of its own. What it pins is the *product* rule rather than any
 * implementation: a combination going quietly legal is the failure worth
 * catching, and it would not show up in a test of a screen or of a PATCH.
 */

const { Pickup, DineIn, Reserve } = RestaurantService;
const { TakeAway, EatIn } = PickupOption;

describe('which combinations describe a real place', () => {
  it.each<[string[], string]>([
    [[], 'a restaurant that has declared nothing yet'],
    [[Pickup], 'a hatch: order ahead and take it away'],
    [[Pickup, DineIn], 'a counter with seats: take it away, or eat in'],
    [[Pickup, Reserve], 'take it away, or book a table'],
    [[DineIn], 'a canteen: eat in, nothing to carry out'],
    [[Reserve], 'booked tables only'],
  ])('allows %p — %s', (services) => {
    expect(checkServices(services)).toBeNull();
  });

  it('refuses a room that both seats walk-ins and books its tables', () => {
    // The rule the whole feature exists for. Both say "you can eat here" and
    // they differ on what the guest does first, so declaring both leaves the
    // pre-order screen unable to say whether "Eat at the Restaurant" means
    // press this or go and book.
    expect(checkServices([Pickup, DineIn, Reserve])).toEqual({
      rule: 'excludes',
      service: DineIn,
      other: Reserve,
    });
    expect(checkServices([DineIn, Reserve])).toEqual({
      rule: 'excludes',
      service: DineIn,
      other: Reserve,
    });
  });

  it('ignores a service it has never heard of', () => {
    // The DTO refuses an unknown value; this is about combinations, and a value
    // outside the vocabulary is not part of any of them. `eat_in` is now one of
    // them: rows written before it stopped being a service still carry it, and
    // it must not turn those rows illegal.
    expect(checkServices([Pickup, 'drive_through'])).toBeNull();
    expect(checkServices([Pickup, 'eat_in'])).toBeNull();
  });
});

describe('walk-ins or bookings', () => {
  it('reads the two seat-getting paths off their own services', () => {
    expect(takesBookings([Pickup])).toBe(false);
    expect(takesBookings([Pickup, Reserve])).toBe(true);
    expect(seatsWalkIns([Pickup])).toBe(false);
    expect(seatsWalkIns([Pickup, DineIn])).toBe(true);
  });

  it('offers both endings where a dining room is declared', () => {
    // A khorovats place with tables: nothing to book, so "eat it here" is a
    // real choice the guest makes when ordering, and the kitchen plates it
    // instead of bagging it. The food is paid for as any pre-order — no
    // deposit, no table held.
    expect(pickupOptionsFor([Pickup, DineIn])).toEqual([TakeAway, EatIn]);
    expect(eatInRequiresBooking([Pickup, DineIn])).toBe(false);
  });

  it('offers take-away alone at a hatch, which has nowhere to sit', () => {
    // Eating in used to be offered here, inferred from the absence of
    // bookings — which assumed every place without a calendar had tables. A
    // window on a street corner does not.
    expect(pickupOptionsFor([Pickup])).toEqual([TakeAway]);
    expect(eatInRequiresBooking([Pickup])).toBe(false);
  });

  it('offers take-away alone once bookings are on, and says why', () => {
    // Eating in at a booking restaurant is a table, a seating and a deposit.
    // The option is still *drawn* — dead, leading to the calendar — which is
    // the second question, and the reason both functions exist.
    expect(pickupOptionsFor([Pickup, Reserve])).toEqual([TakeAway]);
    expect(eatInRequiresBooking([Pickup, Reserve])).toBe(true);
  });

  it('draws no pair at all where there is no pre-order', () => {
    // A lone dead button under a mode nobody picked is furniture.
    expect(pickupOptionsFor([Reserve])).toEqual([]);
    expect(eatInRequiresBooking([Reserve])).toBe(false);
    expect(pickupOptionsFor([DineIn])).toEqual([]);
  });
});

describe('what an order may end as', () => {
  it('never refuses take-away', () => {
    // It is what a pre-order *is*. Including at a place that has declared
    // nothing — every restaurant is created that way, and it still takes the
    // orders it has always taken.
    for (const services of [[], [Pickup], [Pickup, DineIn]]) {
      expect(acceptsPickupOption(services, TakeAway)).toBe(true);
    }
  });

  it('refuses eating in exactly where bookings are taken', () => {
    // Checked on the way in, not merely hidden: a basket outlives the page it
    // was built on, and a branch can start taking bookings between the choice
    // and the payment.
    expect(acceptsPickupOption([Pickup, Reserve], EatIn)).toBe(false);
    expect(acceptsPickupOption([Reserve], EatIn)).toBe(false);
  });

  it('allows eating in wherever bookings are not, including undeclared', () => {
    // Deliberately wider than `pickupOptionsFor`, which wants `dinein` declared
    // before it *shows* the option. Refusing on a field nobody has filled in
    // would break orders a place has always taken; showing less than is allowed
    // only makes a screen careful.
    expect(acceptsPickupOption([Pickup, DineIn], EatIn)).toBe(true);
    expect(acceptsPickupOption([Pickup], EatIn)).toBe(true);
    expect(acceptsPickupOption([], EatIn)).toBe(true);
  });
});

describe('canonicalServices', () => {
  it('orders and de-duplicates', () => {
    expect(canonicalServices([Reserve, Pickup, Reserve, DineIn])).toEqual([
      Pickup,
      DineIn,
      Reserve,
    ]);
  });

  it('keeps a value it does not know, rather than dropping it on save', () => {
    expect(canonicalServices(['drive_through', Pickup])).toEqual([Pickup, 'drive_through']);
  });
});

describe('flipping one switch', () => {
  it('turns the opposite seating off when one goes on', () => {
    // One click, two changes — which is why the panel sends the whole set and
    // shows back what the API stored. Choosing how somebody gets a seat is
    // choosing against the other way of getting one.
    expect(toggleService([Pickup, Reserve], DineIn, true)).toEqual([Pickup, DineIn]);
    expect(toggleService([Pickup, DineIn], Reserve, true)).toEqual([Pickup, Reserve]);
  });

  it('takes nothing with it when a service goes off', () => {
    // Nothing depends on anything any more, so withdrawing one leaves a set
    // that was already legal without it. A place that switches its dining room
    // off is simply one that no longer seats people — which used to be
    // unsayable while `dinein` needed `reserve` to exist at all.
    expect(toggleService([Pickup, DineIn], DineIn, false)).toEqual([Pickup]);
    expect(toggleService([Pickup, Reserve], Reserve, false)).toEqual([Pickup]);
    expect(toggleService([Pickup, DineIn], Pickup, false)).toEqual([DineIn]);
  });

  it('leaves pre-order alone, which conflicts with neither', () => {
    expect(toggleService([], Pickup, true)).toEqual([Pickup]);
    expect(toggleService([DineIn], Pickup, true)).toEqual([Pickup, DineIn]);
    expect(toggleService([Reserve], Pickup, true)).toEqual([Pickup, Reserve]);
  });

  it('never blocks a switch, either way', () => {
    // Turning one on turns its opposite off and turning one off takes nothing
    // with it, so no click lands on an illegal set.
    for (const services of [[], [Pickup], [Pickup, Reserve], [Pickup, DineIn], [DineIn], [Reserve]]) {
      for (const service of [Pickup, DineIn, Reserve]) {
        expect(serviceToggleBreach(services, service, true)).toBeNull();
        expect(serviceToggleBreach(services, service, false)).toBeNull();
      }
    }
  });

  it('still refuses the pair when a body names both directly', () => {
    // A switch can no longer reach the illegal set, but a `PATCH` body can name
    // it, so the API keeps checking rather than trusting the panel.
    expect(checkServices([Pickup, DineIn, Reserve])).toEqual({
      rule: 'excludes',
      service: DineIn,
      other: Reserve,
    });
  });
});
