import { formatAmd, formatDistance, formatPriceLevel } from './format';

describe('formatAmd', () => {
  // Money arrives as an integer in dram and is only ever formatted, never
  // recomputed on the client (DEVELOPMENT_GUIDE.md).
  it.each([
    [1200, '1 200 ֏'],
    [5800, '5 800 ֏'],
    [24000, '24 000 ֏'],
    [360, '360 ֏'],
    [0, '0 ֏'],
  ])('formats %i as %s', (amount, expected) => {
    expect(formatAmd(amount)).toBe(expected);
  });
});

describe('formatDistance', () => {
  it('shows metres below a kilometre', () => {
    expect(formatDistance(0.4)).toBe('400 m');
  });

  it('shows kilometres at or above one', () => {
    expect(formatDistance(1.4)).toBe('1.4 km');
  });

  // The API returns null when the request carried no coordinates; the card
  // must omit the line rather than render "null km".
  it('returns null when distance is unknown', () => {
    expect(formatDistance(null)).toBeNull();
  });
});

describe('formatPriceLevel', () => {
  it.each([
    [1, '$'],
    [2, '$$'],
    [4, '$$$$'],
  ])('renders level %i as %s', (level, expected) => {
    expect(formatPriceLevel(level)).toBe(expected);
  });

  it('returns null when the restaurant has no price level', () => {
    expect(formatPriceLevel(null)).toBeNull();
  });

  // Guards against a bad row rendering an unbounded row of dollar signs.
  it.each([
    [0, '$'],
    [9, '$$$$'],
  ])('clamps an out-of-range level %i to %s', (level, expected) => {
    expect(formatPriceLevel(level)).toBe(expected);
  });
});
