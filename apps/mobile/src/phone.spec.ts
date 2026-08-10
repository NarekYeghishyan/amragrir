import { PHONE_COUNTRIES, isValidNational, phoneCountry, toE164 } from '@amragrir/shared';
import { retypeNational } from './phone';

const armenia = phoneCountry('AM')!;
const russia = phoneCountry('RU')!;

/** What the field does to a value: each keystroke re-typed onto the last one. */
function type(country: Parameters<typeof retypeNational>[0], keys: string): string {
  let value = '';
  for (const key of keys) {
    value = retypeNational(country, value, value + key);
  }
  return value;
}

/** One backspace, as the keyboard delivers it: the last character removed. */
function backspace(country: Parameters<typeof retypeNational>[0], value: string): string {
  return retypeNational(country, value, value.slice(0, -1));
}

describe('retypeNational', () => {
  it('shapes the number as it is typed', () => {
    expect(type(armenia, '99123456')).toBe('99 12 34 56');
    expect(type(russia, '9123456789')).toBe('912 345 67 89');
  });

  it('stops at the country’s own length', () => {
    // The ninth digit is not typed at all, rather than typed and refused on
    // submit — `formatNational`'s cap, reached through the field.
    expect(type(armenia, '991234567')).toBe('99 12 34 56');
  });

  it('deletes a digit when backspace lands on a separator', () => {
    // The whole reason this helper exists: '99 12 34 56' minus its last
    // character is '99 12 34 5', whose digits are unchanged, so reformatting
    // would put the space back and the key would appear dead.
    expect(backspace(armenia, '99 12 34 56')).toBe('99 12 34 5');
    expect(backspace(armenia, '99 12 34 5')).toBe('99 12 34');
    expect(backspace(armenia, '99 12 34')).toBe('99 12 3');
  });

  it('empties the field digit by digit', () => {
    let value = type(armenia, '99123456');
    for (let left = 8; left > 0; left -= 1) {
      value = backspace(armenia, value);
      expect(value.replace(/\D/g, '')).toHaveLength(left - 1);
    }
    expect(value).toBe('');
    // And a backspace on an empty field is not a crash.
    expect(backspace(armenia, '')).toBe('');
  });

  it('takes a pasted international number without its dial code', () => {
    expect(retypeNational(armenia, '', '+374 99 12 34 56')).toBe('99 12 34 56');
    expect(retypeNational(russia, '', '+7 912 345 67 89')).toBe('912 345 67 89');
  });

  it('drops whatever punctuation a paste carries', () => {
    expect(retypeNational(armenia, '', '(099) 12-34-56')).toBe('0 99 12 34 56');
    expect(retypeNational(armenia, '', 'abc')).toBe('');
  });

  it('produces something the screen can send, for every country', () => {
    // What the field holds is what `auth.tsx` hands to `toE164`. A shape the
    // two disagreed on would be a number that looks right and cannot be sent.
    for (const country of PHONE_COUNTRIES) {
      const typed = type(country, country.example.replace(/\D/g, ''));
      expect({ code: country.code, valid: isValidNational(country, typed) }).toEqual({
        code: country.code,
        valid: true,
      });
      expect({ code: country.code, e164: toE164(country, typed) }).toEqual({
        code: country.code,
        e164: `+${country.dial}${country.example.replace(/\D/g, '')}`,
      });
    }
  });
});
