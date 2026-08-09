import { NextResponse, type NextRequest } from 'next/server';
import { parseLanguage } from '@/lib/language';
import { geocoderUrl, readPlaces } from '@/lib/geocode';
import type { Place } from '@/lib/locations';

/**
 * Addresses in and out of coordinates, for the header's location picker.
 *
 * **A proxy, and that is the whole point.** Yandex's Geocoder is an HTTP API
 * whose key cannot be restricted to a domain — anyone who reads it out of a
 * page can spend the quota it belongs to. So the key stays here, on the server,
 * and the browser talks to this route instead. It is the same rule
 * `lib/api.ts` states for the product API: no `NEXT_PUBLIC_` variant, the page
 * never holds the credential.
 *
 * The **map** needs no key at all — it is Yandex's public widget in a frame
 * (`lib/map-frame.ts`), so this is the only credential the picker has and it
 * never leaves this process.
 *
 * Two shapes, both `GET`, and both answering `{ items: Place[]; failed?: true }`:
 *   - `?q=Northern+Avenue`   → matches, best first
 *   - `?lat=40.18&lng=44.51` → the one name for that point, or nothing
 *
 * `failed` is the difference between "Yerevan has no such street" and "this
 * search is broken", and it exists because those two are the same empty list
 * otherwise. The one that actually happens is a key Yandex refuses — which is
 * the day somebody deploys — and a picker that answers "nothing found" to a
 * perfectly real address sends them looking for the bug in the wrong place.
 */
export const dynamic = 'force-dynamic';

/** Long enough not to cut off a slow answer, short enough that the dialog is
 *  not left spinning at somebody who is trying to choose a place. */
const TIMEOUT_MS = 4000;

interface Answer {
  items: Place[];
  /** Absent on a real answer, including a real answer of "no matches". */
  failed?: true;
}

export async function GET(request: NextRequest): Promise<NextResponse<Answer>> {
  const language = parseLanguage(request.nextUrl.pathname.split('/')[1] ?? '') ?? 'hy';
  const key = process.env.YANDEX_GEOCODER_API_KEY;
  // Not configured is not an error: the picker asks whether geocoding is
  // available before offering it, and this is simply the answer for a
  // deployment that has a map key but no geocoder key.
  if (!key) {
    return NextResponse.json({ items: [] });
  }

  const params = request.nextUrl.searchParams;
  const query = params.get('q')?.trim() ?? '';
  const lat = Number(params.get('lat'));
  const lng = Number(params.get('lng'));
  const reverse = params.has('lat') && Number.isFinite(lat) && Number.isFinite(lng);

  if (!reverse && query === '') {
    return NextResponse.json({ items: [] });
  }

  try {
    const response = await fetch(
      geocoderUrl(key, language, reverse ? { lat, lng } : { q: query }),
      {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        // Addresses do not move, but a per-visitor query set is not worth a
        // cache entry each; the dialog debounces instead.
        cache: 'no-store',
      },
    );
    if (!response.ok) {
      // Said out loud, because the visitor is shown a polite sentence and the
      // reason lives here. `403 Invalid api key` is the common one and reads
      // the same whether the key is wrong, unactivated, or for another of
      // Yandex's APIs. **Never log the URL** — the key is in it.
      const said = await response.text().catch(() => '');
      console.error(`[geocode] Yandex answered ${response.status}: ${said.slice(0, 200)}`);
      return NextResponse.json({ items: [], failed: true });
    }
    return NextResponse.json({ items: readPlaces(await response.json()) });
  } catch (error) {
    // Timed out, offline, or an answer that is not JSON at all.
    console.error('[geocode] request failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ items: [], failed: true });
  }
}
