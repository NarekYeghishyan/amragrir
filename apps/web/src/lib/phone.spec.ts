import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PHONE_COUNTRY,
  PHONE_COUNTRIES,
  countryOfE164,
  isValidNational,
  phoneCountry,
  toE164,
} from '@amragrir/shared';
import { Language } from '@amragrir/shared';
import { countryOptions, flagOf } from './phone';

describe('the country list', () => {
  it('defaults to Armenia, which is the market', () => {
    expect(DEFAULT_PHONE_COUNTRY.code).toBe('AM');
    expect(DEFAULT_PHONE_COUNTRY.dial).toBe('374');
    // First in the list, so it is also the first option in the select.
    expect(PHONE_COUNTRIES[0]?.code).toBe('AM');
  });

  it('has no duplicate country or dial/length pair', () => {
    // Two countries that accept the same total length under the same dial code
    // could not be told apart when a whole number arrives.
    const codes = PHONE_COUNTRIES.map((country) => country.code);
    expect(new Set(codes).size).toBe(codes.length);

    const shapes = PHONE_COUNTRIES.flatMap((country) =>
      country.nationalLengths.map((length) => `${country.dial}:${length}`),
    );
    expect(new Set(shapes).size).toBe(shapes.length);
  });

  it('gives every country a placeholder of the right length', () => {
    // The placeholder is what tells somebody how long their number should be;
    // one that disagrees with the rule teaches the wrong thing.
    for (const country of PHONE_COUNTRIES) {
      const digits = country.example.replace(/\D/g, '').length;
      expect(country.nationalLengths, `${country.code} example`).toContain(digits);
    }
  });

  it('rejects an unknown country rather than falling back to Armenian', () => {
    expect(phoneCountry('AM')?.code).toBe('AM');
    expect(phoneCountry('am')?.code).toBe('AM');
    expect(phoneCountry('ZZ')).toBeNull();
    expect(phoneCountry(undefined)).toBeNull();
  });
});

describe('toE164', () => {
  const armenia = phoneCountry('AM')!;
  const russia = phoneCountry('RU')!;

  it('builds the canonical number from a country and a local one', () => {
    expect(toE164(armenia, '99123456')).toBe('+37499123456');
    expect(toE164(armenia, '99 123 456')).toBe('+37499123456');
  });

  it('drops the trunk prefix people dial at home', () => {
    expect(toE164(armenia, '099123456')).toBe('+37499123456');
    expect(toE164(russia, '89123456789')).toBe('+79123456789');
  });

  it('keeps a leading digit that is part of the number, not a trunk prefix', () => {
    // Georgian mobiles are 9 digits and none of them is a trunk 0 — stripping
    // a leading 0 that happens to be there would corrupt a valid number.
    const georgia = phoneCountry('GE')!;
    expect(toE164(georgia, '555123456')).toBe('+995555123456');
  });

  it('returns null for the wrong length instead of throwing', () => {
    // A half-typed number is an ordinary thing for a form to hold.
    expect(toE164(armenia, '9912345')).toBeNull();
    expect(toE164(armenia, '')).toBeNull();
    expect(toE164(russia, '99123456')).toBeNull();
  });

  it('agrees with isValidNational, which is what the field checks', () => {
    for (const country of PHONE_COUNTRIES) {
      expect(isValidNational(country, country.example)).toBe(true);
      expect(toE164(country, country.example)).not.toBeNull();
      expect(isValidNational(country, '1')).toBe(false);
    }
  });
});

describe('countryOfE164', () => {
  it('reads a whole number back to its country', () => {
    expect(countryOfE164('37499123456')?.code).toBe('AM');
    expect(countryOfE164('79123456789')?.code).toBe('RU');
  });

  it('matches the longest dial code, so +971 is not read as +7', () => {
    expect(countryOfE164('971501234567')?.code).toBe('AE');
    expect(countryOfE164('995555123456')?.code).toBe('GE');
  });

  it('is null for a bare national number, which has no country in it', () => {
    expect(countryOfE164('99123456')).toBeNull();
  });
});

describe('countryOptions', () => {
  it('names every country in the visitor’s language', () => {
    const hy = countryOptions(Language.Hy);
    const en = countryOptions(Language.En);

    expect(hy).toHaveLength(PHONE_COUNTRIES.length);
    expect(en[0]?.name).toBe('Armenia');
    // Armenian names come from ICU rather than the dictionaries.
    expect(hy[0]?.name).toBe('Հայաստան');
    expect(hy[0]?.name).not.toBe('AM');
  });

  it('carries the flag and dial code the option shows', () => {
    const [armenia] = countryOptions(Language.En);
    expect(armenia?.flag).toBe('🇦🇲');
    expect(armenia?.dial).toBe('374');
  });

  it('derives the flag from the code rather than storing one', () => {
    expect(flagOf('RU')).toBe('🇷🇺');
    expect(flagOf('ge')).toBe('🇬🇪');
  });
});
