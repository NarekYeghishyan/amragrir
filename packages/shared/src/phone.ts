/**
 * The phone numbers this platform can sign a customer in with.
 *
 * A phone number *is* the customer's identity here — `users.phone` is unique
 * and OTP keys derive from it — so there is exactly one canonical spelling of
 * any number (E.164, `+<dial><national>`), and it is agreed here rather than in
 * each app. The API normalises what it is sent, the web builds the field that
 * collects it, and both read this list; a country added here becomes valid in
 * both at once, which is the only way the two can't drift apart.
 *
 * Armenia is the default because that is the market (AI_CONTEXT.md). The rest
 * are here for the diaspora and for visitors, who order from a home number.
 */

export interface PhoneCountry {
  /** ISO 3166-1 alpha-2. Doubles as the i18n key suffix and the flag emoji. */
  readonly code: string;
  /** Dial code, digits only — no `+`. */
  readonly dial: string;
  /**
   * Valid subscriber-number lengths, in digits after the dial code.
   *
   * A list rather than a number because some countries genuinely vary:
   * a German mobile is 10 or 11 digits and both are ordinary.
   */
  readonly nationalLengths: readonly number[];
  /**
   * The national trunk prefix, when the country has one.
   *
   * People write their own number the way they dial it at home — `099123456`
   * in Yerevan, `8 912…` in Moscow — and that leading digit is *not* part of
   * the number internationally. Stripped before the length is checked.
   */
  readonly trunkPrefix?: string;
  /**
   * How the digits are grouped when written out — `[2, 2, 2]` for Armenia's
   * `99 12 34 56`.
   *
   * Leading groups only: whatever is left over becomes the last one. That is
   * what lets a country with more than one valid length keep a single rule —
   * a German `[3, 3]` writes both `151 234 5678` and `151 234 56789` — instead
   * of a grouping per length.
   */
  readonly groups: readonly number[];
  /**
   * A specimen national number, shown as the field's placeholder.
   *
   * Written in the country's own grouping; `formatNational` is what decides
   * that grouping, and a test holds the two together.
   */
  readonly example: string;
}

/**
 * Ordered as the select renders: the market first, then by how likely a
 * customer here is to hold that number.
 */
export const PHONE_COUNTRIES: readonly PhoneCountry[] = [
  // Armenian mobiles are written in pairs — `+374 99 12 34 56` is how the
  // number appears on a business card here, and how the field lays it out.
  { code: 'AM', dial: '374', nationalLengths: [8], trunkPrefix: '0', groups: [2, 2, 2], example: '99 12 34 56' },
  { code: 'RU', dial: '7', nationalLengths: [10], trunkPrefix: '8', groups: [3, 3, 2], example: '912 345 67 89' },
  { code: 'GE', dial: '995', nationalLengths: [9], trunkPrefix: '0', groups: [3, 2, 2], example: '555 12 34 56' },
  // No trunk prefix: the US "1" is the dial code itself, so stripping a
  // leading 1 would eat a real area code (1xx is not assignable, but 10 digits
  // beginning with 1 arrive from people who typed the country code twice).
  { code: 'US', dial: '1', nationalLengths: [10], groups: [3, 3], example: '201 555 0123' },
  { code: 'FR', dial: '33', nationalLengths: [9], trunkPrefix: '0', groups: [1, 2, 2, 2], example: '6 12 34 56 78' },
  { code: 'DE', dial: '49', nationalLengths: [10, 11], trunkPrefix: '0', groups: [3, 3], example: '151 234 56789' },
  { code: 'IR', dial: '98', nationalLengths: [10], trunkPrefix: '0', groups: [3, 3], example: '912 345 6789' },
  { code: 'AE', dial: '971', nationalLengths: [9], trunkPrefix: '0', groups: [2, 3], example: '50 123 4567' },
];

/** Armenia — the market, and what an unspecified number is assumed to be. */
export const DEFAULT_PHONE_COUNTRY: PhoneCountry = PHONE_COUNTRIES[0] as PhoneCountry;

/** The country with that ISO code, or null. Never falls back: a code nobody
 *  recognises is a broken form, not a reason to sign someone in as Armenian. */
export function phoneCountry(code: string | undefined): PhoneCountry | null {
  const wanted = (code ?? '').trim().toUpperCase();
  return PHONE_COUNTRIES.find((country) => country.code === wanted) ?? null;
}

/** Strips the trunk prefix a local speller includes, when there is one. */
function withoutTrunk(country: PhoneCountry, digits: string): string {
  const { trunkPrefix } = country;
  if (!trunkPrefix || !digits.startsWith(trunkPrefix)) {
    return digits;
  }
  // Only when dropping it lands on a valid length — otherwise the leading
  // digit was part of the subscriber number and removing it corrupts it.
  const stripped = digits.slice(trunkPrefix.length);
  return country.nationalLengths.includes(stripped.length) ? stripped : digits;
}

/** Whether these digits are a whole subscriber number for that country. */
export function isValidNational(country: PhoneCountry, national: string): boolean {
  const digits = national.replace(/\D/g, '');
  return country.nationalLengths.includes(withoutTrunk(country, digits).length);
}

/**
 * The most digits a national number for this country could ever be — the
 * longest subscriber number, plus a trunk prefix in front of it.
 *
 * The ceiling, not the cap: it is only reachable by somebody who *did* write
 * the trunk prefix. `formatNational` holds anyone else to the subscriber
 * number itself, so a country whose numbers are eight digits long never takes
 * a ninth.
 */
export function maxNationalDigits(country: PhoneCountry): number {
  return Math.max(...country.nationalLengths) + (country.trunkPrefix?.length ?? 0);
}

/**
 * A national number written the way that country writes it — `99123456` for
 * Armenia becomes `99 12 34 56`.
 *
 * Built for a field to call on every keystroke, so it has to be total: any
 * string in, something sensible out, including half a number. Non-digits are
 * dropped rather than rejected, which is what lets somebody paste a number with
 * brackets, dots or a `+` and have it land intact.
 *
 * Three things it does beyond grouping, all of them about what people actually
 * type into a phone field:
 *
 * - **Nothing longer than the country allows gets in.** Armenia is eight
 *   digits, so a ninth is dropped rather than typed and refused on submit.
 *   The trunk prefix buys its own extra digit, but only for somebody who
 *   actually wrote it: `099123456` fits, `991234567` is cut to `99123456`.
 * - **A whole international number loses its dial code.** Pasting
 *   `+374 99 12 34 56` into a field already set to Armenia means the same
 *   number twice; keeping both would truncate it to nonsense at the cap.
 *   Only when what remains is a valid length, so a national number that merely
 *   begins with the dial digits is left alone.
 * - **A trunk prefix stays visible, in its own group.** `0 99 12 34 56` is what
 *   was typed, and re-spelling somebody's own number back at them while they
 *   type it reads as the field fighting them. `toE164` drops it later.
 */
export function formatNational(country: PhoneCountry, input: string): string {
  let digits = input.replace(/\D/g, '');

  if (
    digits.startsWith(country.dial) &&
    country.nationalLengths.includes(digits.length - country.dial.length)
  ) {
    digits = digits.slice(country.dial.length);
  }

  // The extra room a trunk prefix needs is given only to somebody who wrote
  // one. Everybody else is capped at the subscriber number, which is what
  // stops a ninth digit going into an eight-digit country.
  const longest = Math.max(...country.nationalLengths);
  const written = country.trunkPrefix !== undefined && digits.startsWith(country.trunkPrefix);
  digits = digits.slice(0, written ? maxNationalDigits(country) : longest);

  // The leading digit is the trunk prefix only when the number is already too
  // long to be a subscriber number on its own — until then it may well be the
  // first digit of one.
  const trunk = written && digits.length > longest ? (country.trunkPrefix as string) : '';
  const subscriber = digits.slice(trunk.length);

  const parts: string[] = [];
  let taken = 0;
  for (const size of country.groups) {
    if (taken >= subscriber.length) {
      break;
    }
    parts.push(subscriber.slice(taken, taken + size));
    taken += size;
  }
  // Whatever the leading groups did not claim is the last group.
  if (taken < subscriber.length) {
    parts.push(subscriber.slice(taken));
  }

  return [trunk, ...parts].filter((part) => part.length > 0).join(' ');
}

/**
 * A country and a national number as one E.164 string, or null if the number
 * does not belong to that country.
 *
 * Returning null rather than throwing: a half-typed number is an ordinary
 * thing for a form to hold, and the caller decides how to say so.
 */
export function toE164(country: PhoneCountry, national: string): string | null {
  const digits = national.replace(/\D/g, '');
  const subscriber = withoutTrunk(country, digits);
  if (!country.nationalLengths.includes(subscriber.length)) {
    return null;
  }
  return `+${country.dial}${subscriber}`;
}

/**
 * The country a full international number belongs to, or null.
 *
 * Longest dial code first, so `+971 50…` is read as the UAE rather than as
 * Russia's `+7` followed by a subscriber number that happens to start with 9.
 */
export function countryOfE164(digits: string): PhoneCountry | null {
  const bare = digits.replace(/\D/g, '');
  const byLongestDial = [...PHONE_COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);

  return (
    byLongestDial.find(
      (country) =>
        bare.startsWith(country.dial) &&
        country.nationalLengths.includes(bare.length - country.dial.length),
    ) ?? null
  );
}
