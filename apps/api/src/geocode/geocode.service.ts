import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Language, geocoderUrl, readPlaces, type Place } from '@amragrir/shared';

/** What every geocode request answers with. */
export interface GeocodeAnswer {
  items: Place[];
  /**
   * The search itself broke, as opposed to answering nothing.
   *
   * Absent on a real answer, including a real answer of "no matches". It exists
   * because those two are otherwise the same empty list, and the one that
   * actually happens is a key Yandex refuses — which is the day somebody
   * deploys. A picker that says "nothing found" for a perfectly real address
   * sends them looking for the bug in the wrong place.
   */
  failed?: true;
  /**
   * Whether this deployment has a key behind it at all.
   *
   * Reported rather than hidden, so a client can stop drawing a search box that
   * can never answer — the same decision the website makes with `canGeocode`,
   * except the phone cannot read the server's environment and has to be told.
   */
  available: boolean;
}

/** Long enough not to cut off a slow answer, short enough that a picker is not
 *  left spinning at somebody who is trying to choose a place. */
const TIMEOUT_MS = 4000;

/**
 * Addresses in and out of coordinates, for the customers' location pickers.
 *
 * **A proxy, and that is the whole point.** Yandex's Geocoder is an HTTP API
 * whose key cannot be restricted to a domain or an app — anyone who reads it
 * out of a page or a bundle can spend the quota it belongs to. So the key stays
 * on a server and the clients ask this instead.
 *
 * **The phone used to have its own geocoder and no longer does.** It named
 * points with `expo-location`, which needs no key and works on a plane; what it
 * cannot do is take a language. Its answers come back in the language of the
 * *operating system*, so an Armenian query on a Russian phone answered in
 * Russian — while the website has always answered in the alphabet the question
 * was typed in (`queryLang`). Matching that is what this module is for.
 *
 * The **map** needs no key at all — it is Yandex's public widget in a frame
 * (`@amragrir/shared`'s `map-view`) — so this is the only credential the
 * feature has, and it never leaves this process.
 */
@Injectable()
export class GeocodeService {
  private readonly logger = new Logger(GeocodeService.name);

  constructor(private readonly config: ConfigService) {}

  /** Whether a key is configured. Not an error when it is not: a deployment may
   *  run without one, and the clients are told so rather than being left to
   *  guess from an empty list. */
  get available(): boolean {
    return this.key !== '';
  }

  /**
   * Matching addresses, best first, in the alphabet the query was typed in.
   *
   * `language` is what the app is being read in and only decides the answer for
   * a query that says nothing about itself — see `queryLang` in
   * `@amragrir/shared`.
   */
  search(query: string, language: Language): Promise<GeocodeAnswer> {
    const text = query.trim();
    if (text === '') {
      return Promise.resolve(this.empty());
    }
    return this.ask({ q: text }, language);
  }

  /** The one name for a point, or nothing. Answered in the app's language: a
   *  tap on a map asked nothing in any alphabet. */
  reverse(lat: number, lng: number, language: Language): Promise<GeocodeAnswer> {
    return this.ask({ lat, lng }, language);
  }

  private async ask(
    request: { q: string } | { lat: number; lng: number },
    language: Language,
  ): Promise<GeocodeAnswer> {
    if (!this.available) {
      return this.empty();
    }

    try {
      const response = await fetch(geocoderUrl(this.key, language, request), {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        // Said out loud, because the customer is shown a polite sentence and the
        // reason lives here. `403 Invalid api key` is the common one and reads
        // the same whether the key is wrong, unactivated, or for another of
        // Yandex's APIs. **Never log the URL** — the key is in it.
        const said = await response.text().catch(() => '');
        this.logger.error(`Yandex answered ${response.status}: ${said.slice(0, 200)}`);
        return { items: [], failed: true, available: true };
      }
      return { items: readPlaces(await response.json()), available: true };
    } catch (error) {
      // Timed out, offline, or an answer that is not JSON at all.
      this.logger.error(`request failed: ${error instanceof Error ? error.message : String(error)}`);
      return { items: [], failed: true, available: true };
    }
  }

  private empty(): GeocodeAnswer {
    return { items: [], available: this.available };
  }

  private get key(): string {
    return this.config.get<string>('YANDEX_GEOCODER_API_KEY') ?? '';
  }
}
