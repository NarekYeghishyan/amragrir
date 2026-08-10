import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PHONE_COUNTRY,
  PHONE_COUNTRIES,
  countryOfE164,
  countryOptions,
  flagOf,
  formatNational,
  isValidNational,
  maxNationalDigits,
  phoneCountry,
  toE164,
} from '@amragrir/shared';
import { Language } from '@amragrir/shared';

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

  it('writes every placeholder in the grouping the field types in', () => {
    // The placeholder shows the shape, then the field imposes it — a
    // placeholder spaced differently would visibly re-space itself on the
    // first keystroke.
    for (const country of PHONE_COUNTRIES) {
      expect(formatNational(country, country.example), `${country.code} example`).toBe(
        country.example,
      );
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

describe('formatNational', () => {
  const armenia = phoneCountry('AM')!;
  const russia = phoneCountry('RU')!;
  const germany = phoneCountry('DE')!;

  it('groups an Armenian number in pairs, as the market writes it', () => {
    expect(formatNational(armenia, '99123456')).toBe('99 12 34 56');
    // With the field's own "+374" in front, this reads +374 99 12 34 56.
    expect(`+${armenia.dial} ${formatNational(armenia, '99123456')}`).toBe('+374 99 12 34 56');
  });

  it('shapes a half-typed number without waiting for the rest', () => {
    expect(formatNational(armenia, '9')).toBe('9');
    expect(formatNational(armenia, '991')).toBe('99 1');
    expect(formatNational(armenia, '9912345')).toBe('99 12 34 5');
  });

  it('is unbothered by whatever punctuation somebody types', () => {
    expect(formatNational(armenia, '(099) 12-34-56')).toBe('0 99 12 34 56');
    expect(formatNational(armenia, '99.12.34.56')).toBe('99 12 34 56');
    expect(formatNational(armenia, '')).toBe('');
    expect(formatNational(armenia, 'abc')).toBe('');
  });

  it('drops the dial code off a whole number pasted into the field', () => {
    // Otherwise "+374 99 12 34 56" would be kept in full and then cut at the
    // cap, silently turning into a number nobody typed.
    expect(formatNational(armenia, '+374 99 12 34 56')).toBe('99 12 34 56');
    expect(formatNational(armenia, '37499123456')).toBe('99 12 34 56');
    expect(formatNational(russia, '+7 912 345 67 89')).toBe('912 345 67 89');
  });

  it('keeps digits that only look like a dial code', () => {
    // 374… as the start of an 8-digit Armenian number is the number itself.
    expect(formatNational(armenia, '37412345')).toBe('37 41 23 45');
  });

  it('keeps the trunk prefix visible in its own group', () => {
    // People type their own number the way they dial it; re-spelling it back
    // at them mid-keystroke reads as the field fighting them. `toE164` is
    // what drops it, later.
    expect(formatNational(armenia, '099123456')).toBe('0 99 12 34 56');
    expect(formatNational(russia, '89123456789')).toBe('8 912 345 67 89');
  });

  it('does not mistake a first digit for a trunk prefix', () => {
    // Eight digits are a whole Armenian number already, so the leading 0 is
    // part of it rather than something dialled in front of it. Only the ninth
    // digit makes it a trunk prefix.
    expect(formatNational(armenia, '09912345')).toBe('09 91 23 45');
  });

  it('stops at the length the country actually has', () => {
    // Eight digits is an Armenian number, so a ninth is not typed at all
    // rather than typed and refused on submit.
    expect(formatNational(armenia, '991234567890')).toBe('99 12 34 56');
    expect(formatNational(armenia, '9912345678').replace(/\D/g, '')).toHaveLength(8);
    expect(formatNational(russia, '91234567890123')).toBe('912 345 67 89');
    expect(formatNational(germany, '1512345678901')).toBe('151 234 56789');
  });

  it('gives the extra digit only to somebody who wrote a trunk prefix', () => {
    // The ceiling is nine for Armenia, but it is reachable only through the 0.
    expect(maxNationalDigits(armenia)).toBe(9);
    expect(formatNational(armenia, '0991234567890')).toBe('0 99 12 34 56');
    expect(formatNational(armenia, '099123456').replace(/\D/g, '')).toHaveLength(9);
    expect(formatNational(armenia, '991234567').replace(/\D/g, '')).toHaveLength(8);
  });

  it('caps every country at something it calls valid', () => {
    // A cap that landed on an invalid length would be a field somebody could
    // fill completely and still be told was wrong, with no way to fix it.
    for (const country of PHONE_COUNTRIES) {
      const typed = formatNational(country, '9'.repeat(20));
      expect(isValidNational(country, typed), `${country.code}`).toBe(true);
    }
  });

  it('lets a country with two lengths keep one grouping', () => {
    expect(formatNational(germany, '1512345678')).toBe('151 234 5678');
    expect(formatNational(germany, '15123456789')).toBe('151 234 56789');
  });

  it('produces something toE164 accepts, for every country', () => {
    // The whole point: what the field holds after formatting is what the
    // server action turns into E.164. A shape the two disagreed on would be a
    // number that looks right and is refused.
    for (const country of PHONE_COUNTRIES) {
      const typed = formatNational(country, country.example);
      expect(isValidNational(country, typed), `${country.code}`).toBe(true);
      expect(toE164(country, typed), `${country.code}`).toBe(
        `+${country.dial}${country.example.replace(/\D/g, '')}`,
      );
    }
  });

  it('is idempotent, because the field reformats what it already formatted', () => {
    for (const country of PHONE_COUNTRIES) {
      const once = formatNational(country, country.example);
      expect(formatNational(country, once), `${country.code}`).toBe(once);
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
