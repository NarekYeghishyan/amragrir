import { MAX_NAME, MIN_NAME, isValidName, normalizeName } from './name';

describe('normalizeName', () => {
  it('sends what was typed, without the spaces around it', () => {
    expect(normalizeName('  Ara Petrosyan ')).toBe('Ara Petrosyan');
  });

  it('cuts to what the API will take', () => {
    expect(normalizeName('a'.repeat(200))).toHaveLength(MAX_NAME);
  });

  it('leaves the spaces inside a name alone', () => {
    expect(normalizeName('Ara  Petrosyan')).toBe('Ara  Petrosyan');
  });
});

describe('isValidName', () => {
  it.each([
    ['a name', 'Ara'],
    ['the shortest one allowed', 'Ա'.repeat(MIN_NAME)],
    ['a name padded with spaces', '  Ара  '],
    // Plenty of people have one name, and this app will meet three alphabets.
    ['a single word', 'Անի'],
  ])('accepts %s', (_case, value) => {
    expect(isValidName(value)).toBe(true);
  });

  it.each([
    ['an empty field', ''],
    ['only whitespace', '   '],
    ['a single character', 'A'],
    ['a single character in spaces', '  A '],
  ])('rejects %s', (_case, value) => {
    expect(isValidName(value)).toBe(false);
  });
});
