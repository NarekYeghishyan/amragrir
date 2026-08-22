import AsyncStorage from '@react-native-async-storage/async-storage';
import { RECENTS_MAX, type Place } from '@amragrir/shared';
import { geocode } from './api/endpoints';
import {
  CHOSEN_PLACE_KEY,
  RECENT_PLACES_KEY,
  areaKeyFor,
  canGeocode,
  forgetGeocoderAvailability,
  nameOf,
  parsePlace,
  parsePlaces,
  readChosenPlace,
  readRecentPlaces,
  rememberPlace,
  searchPlaces,
  writeChosenPlace,
} from './place';

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (key: string) => store.get(key) ?? null),
      setItem: jest.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
      removeItem: jest.fn(async (key: string) => {
        store.delete(key);
      }),
    },
  };
});

// The whole module, so the spec never reaches `fetch` or the base URL that
// `api/client` reads out of the Expo config.
jest.mock('./api/endpoints', () => ({
  geocode: { search: jest.fn(), reverse: jest.fn(), available: jest.fn() },
}));

const search = geocode.search as jest.MockedFunction<typeof geocode.search>;
const reverse = geocode.reverse as jest.MockedFunction<typeof geocode.reverse>;
const available = geocode.available as jest.MockedFunction<typeof geocode.available>;

const NORTHERN: Place = { lat: 40.1811, lng: 44.5136, label: 'Երևան · Հյուսիսային պողոտա' };

beforeEach(async () => {
  await AsyncStorage.removeItem(CHOSEN_PLACE_KEY);
  await AsyncStorage.removeItem(RECENT_PLACES_KEY);
  jest.clearAllMocks();
  forgetGeocoderAvailability();
});

describe('parsePlace', () => {
  it('reads back what was stored', () => {
    expect(parsePlace(NORTHERN)).toEqual(NORTHERN);
  });

  it('rounds a point to the precision the whole product keeps', () => {
    expect(parsePlace({ lat: 40.18111111111, lng: 44.5136, label: 'x' })?.lat).toBe(40.181111);
  });

  it('refuses a point that is not on the globe — the API would measure from it', () => {
    expect(parsePlace({ lat: 91, lng: 44.5, label: 'nowhere' })).toBeNull();
    expect(parsePlace({ lat: 40.18, lng: 200, label: 'nowhere' })).toBeNull();
  });

  it('refuses a row with nothing to show in the header', () => {
    expect(parsePlace({ lat: 40.18, lng: 44.51 })).toBeNull();
    expect(parsePlace({ lat: 40.18, lng: 44.51, label: '   ' })).toBeNull();
  });

  it('refuses what is not a place at all', () => {
    for (const value of [null, undefined, 'Yerevan', 42, []]) {
      expect(parsePlace(value)).toBeNull();
    }
  });

  it('tames a label that would destroy the row it is drawn in', () => {
    const long = parsePlace({ lat: 40.18, lng: 44.51, label: 'a'.repeat(400) });
    expect(long?.label).toHaveLength(80);
    expect(parsePlace({ lat: 40.18, lng: 44.51, label: 'Ave\n\n 5' })?.label).toBe('Ave 5');
  });
});

describe('parsePlaces', () => {
  it('drops the unreadable line rather than the list', () => {
    const raw = JSON.stringify([NORTHERN, { lat: 999, lng: 1, label: 'x' }, 'nonsense']);
    expect(parsePlaces(raw)).toEqual([NORTHERN]);
  });

  it('answers empty for anything that is not a stored list', () => {
    expect(parsePlaces(null)).toEqual([]);
    expect(parsePlaces('{')).toEqual([]);
    expect(parsePlaces('{"lat":1}')).toEqual([]);
  });
});

describe('the chosen place', () => {
  it('survives a restart', async () => {
    await writeChosenPlace(NORTHERN);
    await expect(readChosenPlace()).resolves.toEqual(NORTHERN);
  });

  it('is nothing until one is chosen — which means "wherever this phone is"', async () => {
    await expect(readChosenPlace()).resolves.toBeNull();
  });

  it('is given back by clearing it, not overwritten with the city centre', async () => {
    await writeChosenPlace(NORTHERN);
    await writeChosenPlace(null);
    await expect(readChosenPlace()).resolves.toBeNull();
    await expect(AsyncStorage.getItem(CHOSEN_PLACE_KEY)).resolves.toBeNull();
  });

  it('survives a store that has been corrupted since it was written', async () => {
    await AsyncStorage.setItem(CHOSEN_PLACE_KEY, 'not json');
    await expect(readChosenPlace()).resolves.toBeNull();
  });
});

describe('recent places', () => {
  it('keeps the newest first', async () => {
    const cascade = { lat: 40.1901, lng: 44.5157, label: 'Cascade' };
    await rememberPlace(NORTHERN);
    await rememberPlace(cascade);
    await expect(readRecentPlaces()).resolves.toEqual([cascade, NORTHERN]);
  });

  it('moves the same corner up instead of listing it twice', async () => {
    await rememberPlace(NORTHERN);
    await rememberPlace({ lat: 40.1901, lng: 44.5157, label: 'Cascade' });
    // Same point, renamed by a geocoder that was asked at another zoom.
    await rememberPlace({ ...NORTHERN, label: 'Northern Ave, 5' });
    const recents = await readRecentPlaces();
    expect(recents).toHaveLength(2);
    expect(recents[0]?.label).toBe('Northern Ave, 5');
  });

  it('never grows past the row it is drawn in', async () => {
    for (let step = 0; step < RECENTS_MAX + 3; step += 1) {
      await rememberPlace({ lat: 40.1 + step * 0.01, lng: 44.5, label: `Place ${step}` });
    }
    await expect(readRecentPlaces()).resolves.toHaveLength(RECENTS_MAX);
  });
});

describe('canGeocode', () => {
  it('asks the API whether it has a key, once per session', async () => {
    available.mockResolvedValue({ items: [], available: true });

    await expect(canGeocode('hy')).resolves.toBe(true);
    await expect(canGeocode('hy')).resolves.toBe(true);
    expect(available).toHaveBeenCalledTimes(1);
  });

  it('reads an unreachable API as "no search", and asks again next time', async () => {
    available.mockRejectedValueOnce(new Error('offline'));
    await expect(canGeocode('hy')).resolves.toBe(false);

    available.mockResolvedValue({ items: [], available: true });
    await expect(canGeocode('hy')).resolves.toBe(true);
  });
});

describe('nameOf', () => {
  it('asks once and answers with the name', async () => {
    reverse.mockResolvedValue({
      items: [{ lat: 40.18, lng: 44.51, label: 'Սարյան փող., 5, Երևան' }],
      available: true,
    });

    await expect(nameOf(40.18, 44.51, 'hy')).resolves.toBe('Սարյան փող., 5, Երևան');
    expect(reverse).toHaveBeenCalledWith(40.18, 44.51, 'hy');
  });

  it('answers null rather than throwing at the caller', async () => {
    reverse.mockRejectedValue(new Error('offline'));
    await expect(nameOf(40.18, 44.51, 'hy')).resolves.toBeNull();
  });

  it('answers null when the point has no name', async () => {
    reverse.mockResolvedValue({ items: [], available: true });
    await expect(nameOf(40.18, 44.51, 'hy')).resolves.toBeNull();
  });
});

describe('areaKeyFor', () => {
  it('names a point after the district it falls in', () => {
    expect(areaKeyFor(40.1811, 44.5136)).toBe('locNorthern');
    expect(areaKeyFor(40.2138, 44.5245)).toBe('locZeytun');
  });

  it('always answers, even from outside the city this product serves', () => {
    expect(areaKeyFor(41.7151, 44.8271)).toBe('locZeytun');
  });
});

describe('searchPlaces', () => {
  it('passes the query and the app’s language on, and hands back what came', async () => {
    search.mockResolvedValue({
      items: [{ lat: 40.1798, lng: 44.5152, label: 'Մաշտոցի պող., 20, Երևան' }],
      available: true,
    });

    // Typed in Armenian while reading the Russian app: the alphabet of the
    // answer is the API's decision (`queryLang`), and this only carries what it
    // needs to make it.
    await expect(searchPlaces('Մաշտոց', 'ru')).resolves.toEqual({
      items: [{ lat: 40.1798, lng: 44.5152, label: 'Մաշտոցի պող., 20, Երևան' }],
      failed: false,
    });
    expect(search).toHaveBeenCalledWith('Մաշտոց', 'ru');
  });

  it('drops a result that cannot be chosen or shown', async () => {
    search.mockResolvedValue({
      items: [
        { lat: 40.1798, lng: 44.5152, label: 'Real place' },
        { lat: 999, lng: 44.5, label: 'Off the globe' },
        { lat: 40.18, lng: 44.51, label: '   ' },
      ],
      available: true,
    });

    const { items } = await searchPlaces('anything', 'hy');
    expect(items).toEqual([{ lat: 40.1798, lng: 44.5152, label: 'Real place' }]);
  });

  it('says a broken search is broken, rather than "nothing found"', async () => {
    search.mockResolvedValue({ items: [], failed: true, available: true });
    await expect(searchPlaces('northern', 'hy')).resolves.toEqual({ items: [], failed: true });

    search.mockRejectedValue(new Error('offline'));
    await expect(searchPlaces('northern', 'hy')).resolves.toEqual({ items: [], failed: true });
  });

  it('treats a deployment with no geocoder as a failure, not as an empty city', async () => {
    search.mockResolvedValue({ items: [], available: false });
    await expect(searchPlaces('northern', 'hy')).resolves.toEqual({ items: [], failed: true });
  });

  it('asks nothing for an empty box', async () => {
    await expect(searchPlaces('   ', 'hy')).resolves.toEqual({ items: [], failed: false });
    expect(search).not.toHaveBeenCalled();
  });
});
