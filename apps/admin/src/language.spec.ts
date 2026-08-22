import { describe, expect, it } from 'vitest';
import { Language, OrderStatus, PaymentStatus, StaffRole } from '@amragrir/shared';
import { adminDictionaries } from '@amragrir/i18n/admin';
import { createTranslator } from './language';

const LANGUAGES = [Language.Hy, Language.Ru, Language.En];

/**
 * `hy` is the reference: `tsc` already proves `ru` and `en` define every key it
 * does. What it cannot prove is that any of them is *filled in* — a `""` is a
 * valid string and would render as a blank button.
 */
describe('the dictionaries', () => {
  for (const language of LANGUAGES) {
    it(`has no empty strings in ${language}`, () => {
      const empty = Object.entries(adminDictionaries[language])
        .filter(([, value]) => value.trim() === '')
        .map(([key]) => key);
      expect(empty).toEqual([]);
    });

    it(`asks for no placeholder its callers do not pass in ${language}`, () => {
      // Every `{name}` a string uses has to be one the reference uses too:
      // callers pass the reference's parameters, so a typo like `{brnach}`
      // survives interpolation and reaches the screen as literal braces.
      //
      // A subset, not a match. A language may legitimately use fewer — English
      // "1 branch" needs no `{count}` because its `one` category means exactly
      // one, where Armenian's also covers zero and Russian's covers 21.
      const holes = (value: string): string[] =>
        [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1] as string);

      const reference = adminDictionaries[Language.Hy] as Record<string, string>;
      // Russian defines `_few`/`_many`, which Armenian never selects and so
      // does not carry. They are the same sentence in another category, so the
      // parameters they may use are `_other`'s.
      const referenceFor = (key: string): string =>
        reference[key] ?? reference[key.replace(/_(few|many)$/, '_other')] ?? '';

      const unknown = Object.entries(adminDictionaries[language]).flatMap(([key, value]) => {
        const allowed = new Set(holes(referenceFor(key)));
        return holes(value)
          .filter((name) => !allowed.has(name))
          .map((name) => `${key}: {${name}}`);
      });

      expect(unknown).toEqual([]);
    });
  }
});

/**
 * Every enum the panel renders as a label needs an entry per value.
 *
 * `t(`orderStatus_${status}`)` is checked at compile time, so a missing entry
 * is already a build error. This covers the other direction — a key that
 * exists but was never translated away from its English original — for the
 * enums a kitchen reads all day.
 */
describe('status labels', () => {
  it('names every order status in every language', () => {
    for (const language of LANGUAGES) {
      const t = createTranslator(language);
      for (const status of Object.values(OrderStatus)) {
        expect(t(`orderStatus_${status}`)).not.toBe(`orderStatus_${status}`);
      }
    }
  });

  it('names every payment status and staff role', () => {
    const t = createTranslator(Language.Ru);
    for (const status of Object.values(PaymentStatus)) {
      expect(t(`paymentStatus_${status}`)).not.toBe(`paymentStatus_${status}`);
    }
    for (const role of Object.values(StaffRole)) {
      expect(t(`staffRole_${role}`)).not.toBe(`staffRole_${role}`);
    }
  });
});

describe('interpolation', () => {
  const t = createTranslator(Language.En);

  it('fills a placeholder', () => {
    expect(t('orderCancelTitle', { code: 'K4-71' })).toBe('Cancel order K4-71?');
  });

  it('leaves an unknown placeholder visible rather than blank', () => {
    // A stray `{code}` on screen is a bug report; a gap where a pickup code
    // should be is a member of staff calling out the wrong number.
    expect(t('orderCancelTitle')).toBe('Cancel order {code}?');
  });
});

/**
 * Plurals go through `Intl.PluralRules`, which is why Russian is here.
 *
 * Russian selects four categories where English selects two, and its `one`
 * covers 21 and 101 as well as 1 — the reason none of the `_one` strings in
 * `ru` or `hy` may hardcode the digit.
 */
describe('plurals', () => {
  it('agrees with the count in English', () => {
    const t = createTranslator(Language.En);
    expect(t.plural('branchCount', 1)).toBe('1 branch');
    expect(t.plural('branchCount', 4)).toBe('4 branches');
    expect(t.plural('branchCount', 0)).toBe('0 branches');
  });

  it('picks one, few and many in Russian', () => {
    const t = createTranslator(Language.Ru);
    expect(t.plural('branchCount', 1)).toBe('1 филиал');
    expect(t.plural('branchCount', 3)).toBe('3 филиала');
    expect(t.plural('branchCount', 7)).toBe('7 филиалов');
  });

  it('does not hardcode the digit in a category that covers more than one', () => {
    // 21 selects `one` in Russian. A literal "1" in that string would report
    // twenty-one branches as one.
    const t = createTranslator(Language.Ru);
    expect(t.plural('branchCount', 21)).toBe('21 филиал');
    expect(t.plural('orderCount', 101)).toBe('101 заказ');
  });

  it('covers zero with the Armenian singular, which includes it', () => {
    // `Intl.PluralRules('hy').select(0)` is `one`, so that string has to carry
    // the count rather than the word "1".
    const t = createTranslator(Language.Hy);
    expect(t.plural('dishCount', 0)).toBe('0 ուտեստ');
    expect(t.plural('dishCount', 1)).toBe('1 ուտեստ');
    expect(t.plural('dishCount', 9)).toBe('9 ուտեստ');
  });

  it('takes extra parameters alongside the count', () => {
    const t = createTranslator(Language.En);
    expect(t.plural('promoIssued', 12, { code: 'SUMMER' })).toBe('Issued SUMMER to 12 accounts');
  });
});

describe('falling back', () => {
  it('resolves a language to itself, not to Armenian', () => {
    expect(createTranslator(Language.Ru)('signInTitle')).toBe('Вход');
    expect(createTranslator(Language.En)('signInTitle')).toBe('Sign in');
    expect(createTranslator(Language.Hy)('signInTitle')).toBe('Մուտք');
  });
});
