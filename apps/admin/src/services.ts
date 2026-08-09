// What a restaurant offers, as the panel says it — see docs/BUSINESS_LOGIC.md §2.
//
// Its own module because two screens read it: the restaurant's page, where the
// services are switches, and the activity feed, where a change to them is a
// sentence. The rules about which combinations are allowed are **not** here —
// they are in `@amragrir/shared`, where the API reads the same ones.

import { RestaurantService, type ServiceBreach } from '@amragrir/shared';
import type { AdminTranslationKey } from '@amragrir/i18n/admin';
import type { Translate } from './language';

/** What `restaurants.services` can hold, as translation keys. A value outside
 *  this vocabulary is shown as it is stored rather than dropped — a service
 *  nobody translated is still a service the restaurant advertises. */
export const SERVICE_KEYS: Record<string, AdminTranslationKey> = {
  [RestaurantService.Pickup]: 'restaurantService_pickup',
  [RestaurantService.DineIn]: 'restaurantService_dinein',
  [RestaurantService.Reserve]: 'restaurantService_reserve',
};

/**
 * The line under a service's name, where it needs one.
 *
 * Both hints exist because the two switches have consequences their names do
 * not carry. Pickup says what comes with it — the missing "take away" and
 * "eat here" switches would otherwise read as things not offered — and dine-in
 * says what turning it on *adds and removes*: it brings table booking on with
 * it (`toggleService`), and seating people by booking is what takes the
 * eat-here option off the pre-order choice (BUSINESS_LOGIC.md §2). One click,
 * two switches and a changed guest-facing choice; somebody switching on a
 * dining room is entitled to know that before a guest finds out.
 */
export const SERVICE_HINT_KEYS: Partial<Record<RestaurantService, AdminTranslationKey>> = {
  [RestaurantService.Pickup]: 'restaurantService_pickup_hint',
  [RestaurantService.DineIn]: 'restaurantService_dinein_hint',
};

/** A service's name in the reader's language, falling back to the stored value
 *  for one this build has never heard of. */
export function serviceName(t: Translate, service: string): string {
  const key = SERVICE_KEYS[service];
  return key === undefined ? service : t(key);
}

/** Several of them, as one phrase — the services list on a card, and what an
 *  activity entry says a restaurant was left offering. */
export function serviceList(t: Translate, services: readonly string[]): string {
  return services.length === 0
    ? t('restaurantDetailNone')
    : services.map((service) => serviceName(t, service)).join(' · ');
}

/**
 * Why a switch is dead, said in the row it is dead in.
 *
 * The breach names both services in a fixed order, which is right for a log
 * entry and wrong for a row: the reason a row will not move is always the
 * *other* service. So the one that is not this row is the one to name —
 * naming the row's own back at the reader would read as "dine-in excludes
 * dine-in".
 *
 * Nothing reaches this today. `toggleService` turns the opposite seating off
 * rather than refusing to move, so `serviceToggleBreach` answers null for every
 * row (BUSINESS_LOGIC.md §2). Kept because the panel still asks per row, and a
 * rule between three services — where turning one on could not resolve both
 * conflicts at once — would need the row to explain itself again.
 */
export function blockedReason(
  t: Translate,
  breach: ServiceBreach,
  service: RestaurantService,
): string {
  const blocker = breach.service === service ? breach.other : breach.service;
  return t('restaurantServiceExcludes', { service: serviceName(t, blocker) });
}
