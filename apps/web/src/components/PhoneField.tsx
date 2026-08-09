'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { formatNational, isValidNational, phoneCountry } from '@amragrir/shared';
import type { CountryOption } from '@/lib/phone';

/** How many digits sit in the first `end` characters — the caret's real place. */
function digitsBefore(value: string, end: number): number {
  return value.slice(0, end).replace(/\D/g, '').length;
}

/** The offset that puts `count` digits behind the caret, separators aside. */
function caretAfterDigits(value: string, count: number): number {
  if (count <= 0) {
    return 0;
  }
  let seen = 0;
  for (let at = 0; at < value.length; at += 1) {
    const character = value[at] as string;
    if (character >= '0' && character <= '9') {
      seen += 1;
      if (seen === count) {
        return at + 1;
      }
    }
  }
  return value.length;
}

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
 * is the number taking its country's shape as it is typed, and the hint
 * arriving before the round trip, not permission to submit.
 *
 * Both the shape and the check come from `@amragrir/shared` —
 * `formatNational` and `isValidNational`, the same functions the server builds
 * its answer from — so the field and the server can never disagree about a
 * number.
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
  const [left, setLeft] = useState(false);

  const field = useRef<HTMLInputElement>(null);
  /** Where to put the caret once the reformatted value has been painted. */
  const caret = useRef<number | null>(null);

  const selected = countries.find((country) => country.code === code) ?? countries[0];
  const rules = phoneCountry(code);

  // Reformatting rewrites the whole value, which would otherwise throw the
  // caret to the end on every edit that is not at the end.
  useEffect(() => {
    const at = caret.current;
    caret.current = null;
    if (at !== null) {
      field.current?.setSelectionRange(at, at);
    }
  }, [national]);

  function retype(event: ChangeEvent<HTMLInputElement>) {
    const typed = event.target.value;
    if (!rules) {
      setNational(typed);
      return;
    }

    let kept = digitsBefore(typed, event.target.selectionStart ?? typed.length);
    let digits = typed.replace(/\D/g, '');
    const before = national.replace(/\D/g, '');

    // Backspace onto a separator: the digits are unchanged, so reformatting
    // would put the space straight back and the key would appear to do
    // nothing. Take the digit in front of it instead, which is what was meant.
    if (typed.length < national.length && digits.length === before.length && kept > 0) {
      digits = digits.slice(0, kept - 1) + digits.slice(kept);
      kept -= 1;
    }

    const next = formatNational(rules, digits);
    // Clamped, because formatting can drop digits — a pasted dial code, or
    // anything past the country's length.
    const at = caretAfterDigits(next, Math.min(kept, next.replace(/\D/g, '').length));

    if (next === national) {
      // The keystroke changed nothing — a letter, or a digit past the cap. No
      // re-render follows, so the effect below will not run: React puts the
      // value back on its own, but the caret is left at the end, and this is
      // an edit in the middle of somebody's number.
      requestAnimationFrame(() => field.current?.setSelectionRange(at, at));
      return;
    }

    caret.current = at;
    setNational(next);
  }

  /** A number already typed is re-spelled in the new country's grouping. */
  function chooseCountry(event: ChangeEvent<HTMLSelectElement>) {
    const wanted = event.target.value;
    const nextRules = phoneCountry(wanted);
    setCode(wanted);
    setNational(nextRules ? formatNational(nextRules, national) : national);
  }

  const digits = national.replace(/\D/g, '');
  const valid = rules ? isValidNational(rules, national) : false;
  // Silence while they are still typing: a number is not "wrong" until it is
  // at least as long as a right one would be — or until they have left the
  // field, which says they consider it finished.
  const longest = rules ? Math.max(...rules.nationalLengths) : 0;
  const showHint = digits.length > 0 && !valid && (left || digits.length >= longest);

  return (
    <>
      <label htmlFor="phone">{label}</label>
      <div className="phone-row">
        {/* The dial code leads, because the closed select stands where the
            design prints a plain "+374" and it is the only part that must
            always be legible — a select narrow enough to leave the number room
            truncates, and this puts the country name at the end where losing
            it costs nothing. */}
        <select name="country" aria-label={countryLabel} value={code} onChange={chooseCountry}>
          {countries.map((country) => (
            <option key={country.code} value={country.code}>
              {country.flag} +{country.dial} {country.name}
            </option>
          ))}
        </select>
        {/* The design's hairline: its own 26px element, inset in a 54px row.
            It cannot be the input's `border-left`, because that would tie the
            divider's height to the field's — which is how the field ended up
            26px tall, with only its middle strip clickable. */}
        <span className="divider" aria-hidden="true" />
        {/* No dial code here: the select beside it already carries one, and
            two "+374"s on one row is the same fact printed twice. */}
        <input
          ref={field}
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder={selected?.example}
          value={national}
          onChange={retype}
          onBlur={() => setLeft(true)}
          onFocus={() => setLeft(false)}
          aria-invalid={showHint || undefined}
          aria-describedby={showHint ? 'phone-hint' : undefined}
          required
        />
      </div>
      {showHint && (
        <p className="field-hint warn" id="phone-hint" role="status">
          {invalidHint}
        </p>
      )}
    </>
  );
}
