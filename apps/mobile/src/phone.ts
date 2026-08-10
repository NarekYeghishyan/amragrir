import { formatNational, type PhoneCountry } from '@amragrir/shared';

/**
 * What the number field should hold after a keystroke.
 *
 * Everything about the *shape* of a number — its grouping, its length cap, the
 * dial code a paste carries — is `formatNational` in `@amragrir/shared`, which
 * the web field and the API's `normalizePhone` read too. This adds the one
 * thing a formatted field has to handle itself, and it is here rather than
 * inside the component so it can be tested without rendering one.
 *
 * **Backspace onto a separator.** `99 12 34 56` with the caret at the end, one
 * press: the space goes, the digits are untouched, and reformatting puts the
 * space straight back — so the key appears to do nothing and the number can
 * never be shortened. Taking the digit in front of it instead is what was
 * meant.
 *
 * Unlike the web's field this does not restore a caret. React Native gives a
 * controlled `TextInput` no reliable way to place one — `selection` is a
 * standing source of Android jitter — and the phone's editing gesture is
 * backspace from the end, which is exactly the case above. An edit in the
 * middle jumps to the end here; on the web it does not.
 */
export function retypeNational(country: PhoneCountry, previous: string, typed: string): string {
  const before = previous.replace(/\D/g, '');
  let digits = typed.replace(/\D/g, '');

  if (typed.length < previous.length && digits.length === before.length) {
    digits = digits.slice(0, -1);
  }

  return formatNational(country, digits);
}
