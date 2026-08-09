import { describe, expect, it } from 'vitest';
import { encodePlace, type Place } from './locations';
import {
  RECENTS_MAX,
  SAME_PLACE_METRES,
  parseRecents,
  serializeRecents,
  withRecent,
} from './recent-places';

const at = (lat: number, lng: number, label: string): Place => ({ lat, lng, label });

const KENTRON = at(40.1798, 44.5152, 'Ереван · Центр');
const CASCADE = at(40.1901, 44.5157, 'Ереван · Каскад');

describe('parseRecents / serializeRecents', () => {
  it('round-trips a list', () => {
    const list = [KENTRON, CASCADE];
    expect(parseRecents(serializeRecents(list))).toEqual(list);
  });

  it('reads nothing as an empty list', () => {
    expect(parseRecents(null)).toEqual([]);
    expect(parseRecents(undefined)).toEqual([]);
    expect(parseRecents('')).toEqual([]);
  });

  it('drops a corrupted line rather than the whole list', () => {
    // localStorage is shared with anything else running on this origin and is
    // editable in two clicks. One bad entry must not lose the other four.
    const raw = [encodePlace(KENTRON), 'nonsense', encodePlace(CASCADE)].join('\n');
    expect(parseRecents(raw)).toEqual([KENTRON, CASCADE]);
  });

  it('never reads back more than it stores', () => {
    const many = Array.from({ length: 20 }, (_, i) => at(40.1 + i / 100, 44.5, `p${i}`));
    expect(parseRecents(many.map(encodePlace).join('\n'))).toHaveLength(RECENTS_MAX);
    expect(serializeRecents(many).split('\n')).toHaveLength(RECENTS_MAX);
  });
});

describe('withRecent', () => {
  it('puts the newest first', () => {
    expect(withRecent([CASCADE], KENTRON)).toEqual([KENTRON, CASCADE]);
  });

  it('moves a place back to the front instead of listing it twice', () => {
    expect(withRecent([KENTRON, CASCADE], KENTRON)).toEqual([KENTRON, CASCADE]);
  });

  it('treats a point a few metres off as the same place', () => {
    // A map tap is never repeated to the metre, so exact equality would fill
    // the row with copies of one street corner.
    const nudged = at(KENTRON.lat + 0.0002, KENTRON.lng, 'Ереван · Центр');
    expect(withRecent([KENTRON, CASCADE], nudged)).toEqual([nudged, CASCADE]);
  });

  it('keeps a point that is genuinely somewhere else', () => {
    const far = at(KENTRON.lat + 0.01, KENTRON.lng, 'somewhere else');
    expect(withRecent([KENTRON], far)).toEqual([far, KENTRON]);
  });

  it('takes the new name when the same point comes back renamed', () => {
    // The geocoder does not answer identically at every zoom, and the row
    // should show what was chosen last, not the first name it ever had.
    const renamed = { ...KENTRON, label: 'Абовяна, 12' };
    expect(withRecent([KENTRON], renamed)).toEqual([renamed]);
  });

  it('drops the oldest once the row is full', () => {
    let list: Place[] = [];
    for (let i = 0; i < RECENTS_MAX + 3; i++) {
      list = withRecent(list, at(40.1 + i / 100, 44.5, `p${i}`));
    }
    expect(list).toHaveLength(RECENTS_MAX);
    expect(list[0]!.label).toBe(`p${RECENTS_MAX + 2}`);
    expect(list.some((p) => p.label === 'p0')).toBe(false);
  });

  it('has a same-place threshold that is a block, not a city', () => {
    // Guards the constant itself: at 1km the row would collapse the whole of
    // central Yerevan into one entry.
    expect(SAME_PLACE_METRES).toBeGreaterThan(20);
    expect(SAME_PLACE_METRES).toBeLessThan(300);
  });
});
