import { Language } from '@amragrir/shared';
import { localize, resolveLanguage } from './i18n';

describe('resolveLanguage', () => {
  it.each([
    ['hy', Language.Hy],
    ['ru', Language.Ru],
    ['en', Language.En],
    ['ru-RU', Language.Ru],
    ['en-US,en;q=0.9', Language.En],
    ['fr-FR,fr;q=0.9,ru;q=0.8', Language.Ru],
    ['EN', Language.En],
  ])('resolves %s to %s', (header, expected) => {
    expect(resolveLanguage(header)).toBe(expected);
  });

  // hy is the product default (PROJECT_OVERVIEW.md), not en.
  it.each([
    ['a missing header', undefined],
    ['an empty header', ''],
    ['only unsupported languages', 'fr-FR,de;q=0.8'],
  ])('falls back to hy for %s', (_label, header) => {
    expect(resolveLanguage(header)).toBe(Language.Hy);
  });
});

describe('localize', () => {
  const full = { hy: 'Պիցցա', ru: 'Пицца', en: 'Pizza' };

  it('returns the requested language', () => {
    expect(localize(full, Language.Ru)).toBe('Пицца');
  });

  // A partially translated row should still render something readable.
  it('falls back to hy when the requested language is missing', () => {
    expect(localize({ hy: 'Պիցցա' }, Language.En)).toBe('Պիցցա');
  });

  it('falls back to any populated value when hy is missing too', () => {
    expect(localize({ en: 'Pizza' }, Language.Ru)).toBe('Pizza');
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty object', {}],
  ])('returns an empty string for %s', (_label, field) => {
    expect(localize(field, Language.Hy)).toBe('');
  });
});
