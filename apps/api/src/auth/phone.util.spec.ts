import { BadRequestException } from '@nestjs/common';
import { maskPhone, normalizePhone } from './phone.util';

describe('normalizePhone', () => {
  // users.phone is unique and OTP keys derive from it — two spellings of the
  // same number must collapse to one canonical value or they become two
  // accounts that can never be merged.
  it.each([
    ['+37499123456', '+37499123456'],
    ['37499123456', '+37499123456'],
    ['0037499123456', '+37499123456'],
    ['099123456', '+37499123456'],
    ['99123456', '+37499123456'],
    ['99 123 456', '+37499123456'],
    ['+374 99 123 456', '+37499123456'],
    ['+374-99-123-456', '+37499123456'],
    ['  99123456  ', '+37499123456'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  // A bare national number is read as Armenian — that is the market, and it is
  // what someone typing their own number means. A number that carries its
  // country is taken at its word, for any country the sign-in form offers.
  it.each([
    ['+79123456789', '+79123456789', 'Russia'],
    ['+7 912 345 67 89', '+79123456789', 'Russia, spelled out'],
    ['+995555123456', '+995555123456', 'Georgia'],
    ['+12015550123', '+12015550123', 'the US'],
    ['+33612345678', '+33612345678', 'France'],
    ['+4915123456789', '+4915123456789', 'Germany, the 11-digit form'],
    ['+491512345678', '+491512345678', 'Germany, the 10-digit form'],
    ['+989123456789', '+989123456789', 'Iran'],
    ['+971501234567', '+971501234567', 'the UAE'],
    ['00971501234567', '+971501234567', 'the UAE, dialled as 00'],
  ])('normalizes %s to %s (%s)', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it('reads +971… as the UAE rather than as Russia with a 9 in front', () => {
    // The dial codes are matched longest-first. `+7` is a prefix of nothing
    // here, but `+971` would be mis-split by a shortest-first match.
    expect(normalizePhone('+971501234567')).toBe('+971501234567');
  });

  it.each([
    ['', 'empty'],
    ['   ', 'blank'],
    ['abcdef', 'no digits'],
    ['9912345', 'too short'],
    ['991234567', 'too long'],
    ['+1202555017', 'a US number one digit short'],
    ['+7912345678', 'a Russian number two digits short'],
    ['+9999123456789', 'a country nobody here can sign in from'],
  ])('rejects %s (%s)', (input) => {
    expect(() => normalizePhone(input)).toThrow(BadRequestException);
  });
});

describe('maskPhone', () => {
  it('keeps only the country code and last two digits', () => {
    expect(maskPhone('+37499123456')).toBe('+374******56');
  });

  it('leaves very short values alone', () => {
    expect(maskPhone('+374')).toBe('+374');
  });
});
