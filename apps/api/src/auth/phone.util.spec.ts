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

  it.each([
    ['', 'empty'],
    ['   ', 'blank'],
    ['abcdef', 'no digits'],
    ['9912345', 'too short'],
    ['991234567', 'too long'],
    ['+1202555017', 'wrong country code'],
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
