import { MAX_ZOOM, MIN_ZOOM, PINCH_STEP, zoomSteps, zoomedBy } from '@amragrir/shared';

/**
 * The rule that turns a gesture into a zoom level.
 *
 * The map in the location sheet is a picture of a widget that draws whole
 * levels only (`src/components/YandexMap.tsx`), so a pinch — or, in the browser
 * build, a trackpad's wheel — scales the picture live and has to land on one of
 * them when it stops. Getting this threshold wrong is not a rounding error: too
 * high and every ordinary pinch springs back unchanged, which reads as a
 * gesture that does not work at all.
 */
describe('zoomSteps', () => {
  it('is one level for a pinch that doubles, as a tile pyramid says', () => {
    expect(zoomSteps(2)).toBe(1);
    expect(zoomSteps(0.5)).toBe(-1);
  });

  it('counts several levels for a gesture that means several', () => {
    expect(zoomSteps(4)).toBe(2);
    expect(zoomSteps(0.25)).toBe(-2);
  });

  it('answers a quarter again as large with a whole level, both ways', () => {
    // The bug this exists to prevent: `Math.round(Math.log2(spread))` alone
    // needs √2 ≈ 1.42 before it answers anything but zero, and on a map box the
    // size of a phone's that is most of the box.
    expect(zoomSteps(PINCH_STEP)).toBe(1);
    expect(zoomSteps(1.3)).toBe(1);
    expect(zoomSteps(1 / PINCH_STEP)).toBe(-1);
    expect(zoomSteps(0.75)).toBe(-1);
  });

  it('leaves the map alone for a hand settling on the glass', () => {
    expect(zoomSteps(1)).toBe(0);
    expect(zoomSteps(1.1)).toBe(0);
    expect(zoomSteps(0.95)).toBe(0);
  });

  it('never answers a nonsense scaling, which is a gesture with one finger', () => {
    expect(zoomSteps(0)).toBe(0);
    expect(zoomSteps(-1)).toBe(0);
    expect(zoomSteps(Number.NaN)).toBe(0);
  });

  it('cannot take the map past the range where it is a city', () => {
    const closest = { lat: 40.1776, lng: 44.5126, zoom: MAX_ZOOM };
    const widest = { ...closest, zoom: MIN_ZOOM };
    expect(zoomedBy(closest, zoomSteps(4)).zoom).toBe(MAX_ZOOM);
    expect(zoomedBy(widest, zoomSteps(0.25)).zoom).toBe(MIN_ZOOM);
  });
});
