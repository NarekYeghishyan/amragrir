import { describe, expect, it } from 'vitest';
import { Language, RestaurantService, serviceToggleBreach } from '@amragrir/shared';
import { createTranslator } from './language';
import { blockedReason, serviceList, serviceName } from './services';

const { Pickup, DineIn, Reserve } = RestaurantService;

const t = createTranslator(Language.En);

/**
 * The row a blocked switch renders.
 *
 * Whether a switch may be flipped is `serviceToggleBreach`, tested against the
 * business rule in the API. What is tested here is the half this panel owns:
 * naming the *other* service — the one somebody has to turn off first — which
 * is not the one the breach happens to name first.
 */
function reasonFor(services: string[], service: RestaurantService): string | null {
  const on = services.includes(service);
  const breach = serviceToggleBreach(services, service, !on);
  return breach === null ? null : blockedReason(t, breach, service);
}

describe('why a service switch is dead', () => {
  it('leaves every switch alive, including the dining room', () => {
    // No row is dead any more: turning one seating on turns the other off, so
    // there is no click left that lands on an illegal set. The dine-in row used
    // to be the exception — disabled until somebody found the booking switch —
    // which enforced the rule by making them satisfy it by hand.
    expect(reasonFor([Pickup], DineIn)).toBeNull();
    expect(reasonFor([], DineIn)).toBeNull();
    expect(reasonFor([Pickup, DineIn], Reserve)).toBeNull();
    expect(reasonFor([Pickup, Reserve], DineIn)).toBeNull();
    expect(reasonFor([], Pickup)).toBeNull();
    expect(reasonFor([], Reserve)).toBeNull();
  });

  it('still names the other service if a rule ever does block a row', () => {
    // `blockedReason` outlives the state that used to reach it: the breach
    // names the pair in one fixed order, which is right for a log entry and
    // wrong for a row. The reason a row is dead is always the *other* service —
    // naming the row's own back at the reader would read as "dine-in excludes
    // dine-in". Fed the breach directly, since no toggle produces one now.
    const breach = { rule: 'excludes', service: DineIn, other: Reserve } as const;
    expect(blockedReason(t, breach, DineIn)).toBe('Not available while Table booking is on');
    expect(blockedReason(t, breach, Reserve)).toBe(
      'Not available while Eat at the Restaurant is on',
    );
  });
});

describe('naming services', () => {
  it('shows a service this build has never heard of as it is stored', () => {
    // A service nobody has translated is still one the restaurant advertises;
    // dropping it would be the panel deciding it does not exist.
    expect(serviceName(t, 'drive_through')).toBe('drive_through');
    expect(serviceList(t, [Pickup, 'drive_through'])).toBe('Pre-Order · drive_through');
  });

  it('says so when a restaurant offers nothing yet', () => {
    expect(serviceList(t, [])).toBe('—');
  });
});
