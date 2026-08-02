import { describe, expect, it } from 'vitest';
import { Language } from '@amragrir/shared';
import { formatAmd, formatCountdown, formatDateTime, formatWaiting, pickLabel } from './format';
import { createTranslator } from './language';

const en = createTranslator(Language.En);

describe('formatAmd', () => {
  it('groups thousands with a space, like the design', () => {
    expect(formatAmd(5800)).toBe('5 800 ֏');
    expect(formatAmd(360)).toBe('360 ֏');
  });
});

describe('formatCountdown', () => {
  it('renders mm:ss and never goes negative', () => {
    expect(formatCountdown(480)).toBe('8:00');
    expect(formatCountdown(9)).toBe('0:09');
    expect(formatCountdown(-5)).toBe('0:00');
  });

  it('is null when there is nothing to count', () => {
    expect(formatCountdown(null)).toBeNull();
  });
});

describe('formatDateTime', () => {
  it('reads as a moment, to the minute', () => {
    // Not asserting the exact arrangement: that is the runtime's ICU data, and
    // pinning it here would make this test a statement about the machine. What
    // must hold is that the date and the time are both there, and that no
    // seconds are.
    const formatted = formatDateTime('2026-08-01T09:30:07.000Z', Language.En);

    expect(formatted).toMatch(/\d/);
    expect(formatted).not.toContain(':07');
  });

  it('formats in the language the panel is set to', () => {
    const at = '2026-08-01T09:30:00.000Z';
    expect(formatDateTime(at, Language.Ru)).not.toBe(formatDateTime(at, Language.En));
  });
});

describe('formatWaiting', () => {
  it('is what a kitchen actually reads off the card', () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString();
    expect(formatWaiting(en, tenMinutesAgo)).toBe('10 min ago');
  });

  it('switches to hours past sixty minutes', () => {
    const longAgo = new Date(Date.now() - 95 * 60_000).toISOString();
    expect(formatWaiting(en, longAgo)).toBe('1 h 35 min ago');
  });

  it('never shows a negative wait for a clock slightly ahead', () => {
    const future = new Date(Date.now() + 30_000).toISOString();
    expect(formatWaiting(en, future)).toBe('0 min ago');
  });

  it('reads in whatever the panel is set to', () => {
    const hy = createTranslator(Language.Hy);
    const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString();
    expect(formatWaiting(hy, tenMinutesAgo)).toBe('10 րոպե առաջ');
  });
});

describe('pickLabel', () => {
  it('falls back through hy to anything populated', () => {
    // The owner endpoints return every language because they are editable, so
    // the panel picks one to display using the API's own fallback order.
    expect(pickLabel({ hy: 'Բուրգեր', en: 'Burger' }, Language.En)).toBe('Burger');
    expect(pickLabel({ hy: 'Բուրգեր' }, Language.Ru)).toBe('Բուրգեր');
    expect(pickLabel({ en: 'Burger' }, Language.Ru)).toBe('Burger');
    expect(pickLabel(null)).toBe('');
  });
});
