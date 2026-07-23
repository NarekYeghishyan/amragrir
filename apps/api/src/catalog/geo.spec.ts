import { distanceKm, roundKm } from './geo';

const REPUBLIC_SQUARE = { lat: 40.1776, lng: 44.5126 };
const CASCADE = { lat: 40.1901, lng: 44.5157 };

describe('distanceKm', () => {
  it('returns zero for the same point', () => {
    expect(distanceKm(REPUBLIC_SQUARE, REPUBLIC_SQUARE)).toBe(0);
  });

  // Republic Square to the Cascade is roughly 1.4 km on the ground.
  it('measures a known short distance in Yerevan', () => {
    const km = distanceKm(REPUBLIC_SQUARE, CASCADE);

    expect(km).toBeGreaterThan(1.2);
    expect(km).toBeLessThan(1.7);
  });

  it('is symmetric', () => {
    expect(distanceKm(REPUBLIC_SQUARE, CASCADE)).toBeCloseTo(
      distanceKm(CASCADE, REPUBLIC_SQUARE),
      10,
    );
  });

  it('handles a long distance (Yerevan to Moscow ≈ 1800 km)', () => {
    const moscow = { lat: 55.7558, lng: 37.6173 };
    const km = distanceKm(REPUBLIC_SQUARE, moscow);

    expect(km).toBeGreaterThan(1700);
    expect(km).toBeLessThan(1900);
  });
});

describe('roundKm', () => {
  it.each([
    [0.44, 0.4],
    [0.45, 0.5],
    [1.23, 1.2],
    [12.98, 13],
  ])('rounds %s to %s', (input, expected) => {
    expect(roundKm(input)).toBe(expected);
  });
});
