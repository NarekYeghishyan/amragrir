import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ORDER_ROBOTS } from './site';
import { ORDER_STATUS_LABEL, canCancel, stepIndex } from './order-status';
import { OrderStatus } from '@amragrir/shared';
import { dictionaries } from '@amragrir/i18n';
import { Language } from '@amragrir/shared';

const APP = join(__dirname, '..', 'app', '[lang]');

/**
 * Every page in the order flow shows one visitor's basket or one visitor's
 * order. Indexing them would spend a crawler's budget on pages that can never
 * be a useful result — and could put somebody's order total in a search
 * listing. This is the guard that a new screen cannot ship without saying so.
 */
describe('the order flow is never indexed', () => {
  const pages = [
    'cart/page.tsx',
    'preorder/page.tsx',
    'checkout/page.tsx',
    'signin/page.tsx',
    'orders/page.tsx',
    'orders/[id]/page.tsx',
  ];

  it.each(pages)('%s declares ORDER_ROBOTS', (page) => {
    const source = readFileSync(join(APP, page), 'utf8');
    expect(source).toContain('robots: ORDER_ROBOTS');
  });

  it('and ORDER_ROBOTS actually means noindex', () => {
    expect(ORDER_ROBOTS).toEqual({ index: false, follow: true });
  });
});

/**
 * `revalidatePath` names a **route**, and every route in this app is
 * `/[lang]/…` — Armenian's unprefixed URL is a middleware rewrite, not a route.
 * A call handed a link helper directly would revalidate nothing, for the
 * language that is most of the traffic, and nothing would report it: the
 * customer simply sees a basket without the dish they just added.
 */
describe('cache invalidation names routes, not links', () => {
  it('every revalidatePath goes through routePath', () => {
    const source = readFileSync(join(APP, 'actions.ts'), 'utf8');
    const calls = source.match(/revalidatePath\(/g) ?? [];
    const wrapped = source.match(/revalidatePath\(routePath\(/g) ?? [];

    expect(calls.length).toBeGreaterThan(0);
    expect(wrapped.length, 'a revalidatePath call is missing routePath()').toBe(calls.length);
  });
});

describe('order statuses', () => {
  // A status added to packages/shared without a translation would otherwise
  // print its raw enum value on an Armenian page.
  it('every status has a label in all three languages', () => {
    for (const status of Object.values(OrderStatus)) {
      const key = ORDER_STATUS_LABEL[status];
      expect(key, `no label key for ${status}`).toBeTruthy();
      for (const language of Object.values(Language)) {
        expect(
          (dictionaries[language] as Record<string, string>)[key],
          `${language} is missing ${key}`,
        ).toBeTruthy();
      }
    }
  });

  // Paying commits the order for the customer *and* the restaurant
  // (BUSINESS_LOGIC.md §4) — the kitchen has already started.
  it('only an unpaid order may be cancelled', () => {
    expect(canCancel(OrderStatus.Created)).toBe(true);
    for (const status of Object.values(OrderStatus).filter((s) => s !== OrderStatus.Created)) {
      expect(canCancel(status), `${status} must not be cancellable`).toBe(false);
    }
  });

  it('puts a paid order at the first step and a finished one at the last', () => {
    expect(stepIndex(OrderStatus.Paid)).toBe(0);
    expect(stepIndex(OrderStatus.Ready)).toBe(3);
    expect(stepIndex(OrderStatus.Completed)).toBe(3);
    // Neither of these is a point on a line that only moves forwards.
    expect(stepIndex(OrderStatus.Created)).toBe(-1);
    expect(stepIndex(OrderStatus.Cancelled)).toBe(-1);
  });
});
