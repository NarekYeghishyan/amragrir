'use client';

import { useState } from 'react';
import { isValidNational, phoneCountry } from '@amragrir/shared';
import type { CountryOption } from '@/lib/phone';

/**
 * Country, then the number — the phone field the sign-in form collects.
 *
 * The two travel as separate form fields (`country` and `phone`) rather than as
 * one string, because a country the visitor *chose* is not a guess: `+374` and
 * a bare `0…` are ambiguous in a way that a picked country never is.
 *
 * A client component only for the live feedback. Everything that decides
 * whether the number is accepted happens twice on the server — in
 * `requestCode`, and again in the API's `normalizePhone` — so with JavaScript
 * off this is still a working `<select>` and `<input>` that post and get a
 * translated answer, exactly as the rest of the flow does. What mounting adds
 * is the placeholder following the country and the hint appearing before the
 * round trip, not permission to submit.
 *
 * The check itself is `isValidNational` from `@amragrir/shared` — the same
 * function the server uses, so the two can never disagree about a number.
 */
export function PhoneField({
  countries,
  defaultCountry,
  label,
  countryLabel,
  invalidHint,
}: {
  countries: CountryOption[];
  defaultCountry: string;
  label: string;
  countryLabel: string;
  /** Shown once the number is long enough to be wrong rather than unfinished. */
  invalidHint: string;
}) {
  const [code, setCode] = useState(defaultCountry);
  const [national, setNational] = useState('');

  const selected = countries.find((country) => country.code === code) ?? countries[0];
  const rules = phoneCountry(code);

  const digits = national.replace(/\D/g, '');
  const valid = rules ? isValidNational(rules, national) : false;
  // Silence while they are still typing: a number is not "wrong" until it is
  // at least as long as a right one would be.
  const longest = rules ? Math.max(...rules.nationalLengths) : 0;
  const showHint = digits.length > 0 && !valid && digits.length >= longest;

  return (
    <>
      <label htmlFor="phone">{label}</label>
      <div className="phone-row">
        <select
          name="country"
          aria-label={countryLabel}
          value={code}
          onChange={(event) => setCode(event.target.value)}
        >
          {countries.map((country) => (
            <option key={country.code} value={country.code}>
              {country.flag} {country.name} +{country.dial}
            </option>
          ))}
        </select>
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder={selected?.example}
          value={national}
          onChange={(event) => setNational(event.target.value)}
          aria-invalid={showHint || undefined}
          aria-describedby={showHint ? 'phone-hint' : undefined}
          required
        />
      </div>
      {showHint && (
        <p className="field-hint warn" id="phone-hint">
          {invalidHint}
        </p>
      )}
    </>
  );
}
