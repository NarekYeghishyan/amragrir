import { describe, expect, it } from 'vitest';
import { telHref } from './format';

describe('telHref', () => {
  // Branches store a number formatted for reading (`+374 10 555 001`). RFC 3966
  // does not allow a space as a visual separator, and a `tel:` with spaces in
  // it is handled inconsistently once it leaves the browser for a dialer.
  it('strips the spaces a stored number is formatted with', () => {
    expect(telHref('+374 10 555 001')).toBe('tel:+37410555001');
  });

  it('keeps the leading plus, so the country code survives', () => {
    expect(telHref('+374 10 555 001')).toContain('+374');
  });

  it('drops the punctuation a number may be written with', () => {
    expect(telHref('+374 (10) 555-001')).toBe('tel:+37410555001');
  });

  it('leaves an already-bare number alone', () => {
    expect(telHref('+37410555001')).toBe('tel:+37410555001');
  });
});
