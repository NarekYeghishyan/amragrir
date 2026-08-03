import { PHONE_COUNTRIES, type Language } from '@amragrir/shared';

/**
 * The country list as the sign-in select needs it: named in the visitor's
 * language, and carrying its own placeholder.
 *
 * The countries themselves come from `@amragrir/shared`, which the API's
 * `normalizePhone` also reads — offering a country the API would reject is the
 * one bug this field can have, and sharing the list is what prevents it.
 */
export interface CountryOption {
  code: string;
  dial: string;
  /** Localised country name — see `countryOptions` for why this is not i18n. */
  name: string;
  flag: string;
  example: string;
}

/**
 * The flag emoji for an ISO 3166-1 alpha-2 code.
 *
 * Regional indicator symbols: 'AM' → 🇦🇲. Derived rather than stored, because a
 * table of eight emoji is a table that can disagree with the eight codes.
 */
export function flagOf(code: string): string {
  const BASE = 0x1f1e6; // REGIONAL INDICATOR SYMBOL LETTER A
  return String.fromCodePoint(
    ...[...code.toUpperCase()].map((letter) => BASE + letter.charCodeAt(0) - 'A'.charCodeAt(0)),
  );
}

/**
 * Country names come from `Intl.DisplayNames`, not from the dictionaries.
 *
 * Every country name in every language is already in ICU, correctly declined
 * and kept current; copying eight of them into three JSON files would add
 * twenty-four strings that only exist to drift. The dictionaries hold what is
 * *ours* to write — labels, errors — and this is not that.
 *
 * The fallback is the ISO code, so a runtime without the locale data shows
 * "AM +374" rather than an empty option.
 */
export function countryOptions(language: Language): CountryOption[] {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([language], { type: 'region' });
  } catch {
    names = null;
  }

  return PHONE_COUNTRIES.map((country) => ({
    code: country.code,
    dial: country.dial,
    name: names?.of(country.code) ?? country.code,
    flag: flagOf(country.code),
    example: country.example,
  }));
}
