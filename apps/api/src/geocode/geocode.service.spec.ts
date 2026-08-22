import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Language } from '@amragrir/shared';
import { GeocodeService } from './geocode.service';

/** A Yandex answer, trimmed to the levels this service reads. */
const answer = (places: { pos: string; name: string; description: string }[]) => ({
  response: {
    GeoObjectCollection: {
      featureMember: places.map((place) => ({
        GeoObject: {
          Point: { pos: place.pos },
          name: place.name,
          description: place.description,
        },
      })),
    },
  },
});

const build = (key?: string) => {
  const config = {
    get: (name: string) => (name === 'YANDEX_GEOCODER_API_KEY' ? key : undefined),
  } as unknown as ConfigService;
  return new GeocodeService(config);
};

const fetchMock = jest.fn();
const asked = (): URL => new URL(String(fetchMock.mock.calls[0]?.[0]));

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  // Nothing here should shout at a passing test run; the error paths below are
  // deliberate and the service logs each one.
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

describe('with no key configured', () => {
  it('says so instead of failing, and asks Yandex nothing', async () => {
    const service = build(undefined);

    await expect(service.search('Mashtots', Language.Hy)).resolves.toEqual({
      items: [],
      available: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers the same for a point', async () => {
    await expect(build('').reverse(40.18, 44.51, Language.Hy)).resolves.toEqual({
      items: [],
      available: false,
    });
  });
});

describe('search', () => {
  it('reads places out of the answer', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () =>
        answer([{ pos: '44.5152 40.1798', name: 'Մաշտոցի պող., 20', description: 'Երևան' }]),
    });

    await expect(build('key').search('Մաշտոց', Language.Ru)).resolves.toEqual({
      items: [{ lat: 40.1798, lng: 44.5152, label: 'Մաշտոցի պող., 20, Երևան' }],
      available: true,
    });
  });

  it('answers in the alphabet the question was typed in, not the app’s', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => answer([]) });

    // Armenian typed while reading the Russian app.
    await build('key').search('Մաշտոց', Language.Ru);
    expect(asked().searchParams.get('lang')).toBe('hy_AM');

    fetchMock.mockClear();
    // Cyrillic typed while reading the Armenian app.
    await build('key').search('Маштоц', Language.Hy);
    expect(asked().searchParams.get('lang')).toBe('ru_RU');

    fetchMock.mockClear();
    // Latin says nothing about which language is wanted — both others are
    // routinely transliterated into it — so the app's language decides.
    await build('key').search('Mashtots', Language.Hy);
    expect(asked().searchParams.get('lang')).toBe('hy_AM');
  });

  it('asks nothing for an empty box', async () => {
    await expect(build('key').search('   ', Language.Hy)).resolves.toEqual({
      items: [],
      available: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a refused key as a failure, not as "nothing found"', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => '{"message":"Invalid api key"}',
    });

    await expect(build('key').search('Mashtots', Language.Hy)).resolves.toEqual({
      items: [],
      failed: true,
      available: true,
    });
  });

  it('reports a timeout the same way', async () => {
    fetchMock.mockRejectedValue(new Error('The operation was aborted'));

    await expect(build('key').search('Mashtots', Language.Hy)).resolves.toEqual({
      items: [],
      failed: true,
      available: true,
    });
  });
});

describe('reverse', () => {
  it('names a point in the app’s language — a tap asked in no alphabet', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => answer([]) });

    await build('key').reverse(40.1798, 44.5152, Language.Hy);
    const url = asked();
    expect(url.searchParams.get('lang')).toBe('hy_AM');
    // Longitude first, as everywhere in Yandex's APIs: the other way round
    // names a point in the Indian Ocean.
    expect(url.searchParams.get('geocode')).toBe('44.5152,40.1798');
    expect(url.searchParams.get('results')).toBe('1');
  });

  it('never puts the key anywhere but the request', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => answer([]) });

    const result = await build('secret-key').reverse(40.18, 44.51, Language.Hy);
    expect(JSON.stringify(result)).not.toContain('secret-key');
    expect(asked().searchParams.get('apikey')).toBe('secret-key');
  });
});
