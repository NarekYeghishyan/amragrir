import { NextResponse, type NextRequest } from 'next/server';
import { RESERVATION_MAX_GUESTS } from '@amragrir/shared';
import { api, ApiError, type Slot } from '@/lib/api';
import { parseLanguage } from '@/lib/language';

/**
 * The table times for one day, as JSON — what the checkout's calendar asks when
 * a day is tapped.
 *
 * The page already fetches this for the day the field opens on; that answer is
 * rendered server-side and is the calendar's **first** one. Every day after it
 * is chosen in the browser, and a day is not worth a Server Action: nothing
 * else on the checkout changes when you look at Thursday, so revalidating the
 * route would re-price the basket and rebuild the page to fill in a grid of
 * times. This is the same shape `GET /[lang]/basket` takes for the order panel,
 * and for the same reason.
 *
 * **Public data, and nothing else is exposed.** `GET /restaurants/{id}
 * /availability` needs no token — a visitor may look at a restaurant's free
 * tables before signing in — so this handler carries no session and reads no
 * cookies. It answers slots and the seating limit; the deposit stays where it
 * was, on the server-rendered page, because it is money and it is sized by the
 * party rather than by the day.
 */
export const dynamic = 'force-dynamic';

export interface DayAvailability {
  slots: Slot[];
  maxSeats: number;
  reservationsEnabled: boolean;
}

/** An answer the picker can draw: no slots, rather than an error to handle. */
const NOTHING: DayAvailability = { slots: [], maxSeats: 0, reservationsEnabled: false };

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lang: string }> },
): Promise<NextResponse<DayAvailability>> {
  const { lang } = await params;
  const language = parseLanguage(lang);
  const query = request.nextUrl.searchParams;
  const branch = query.get('branch') ?? '';
  const date = query.get('date') ?? '';
  const guests = Number(query.get('guests'));

  // Checked here rather than passed on: the API would refuse these anyway, and
  // a 422 travelling back through a fetch is a state the picker would have to
  // draw. Its bounds are the API's own (`ReservationAvailabilityQuery`).
  const usable =
    language !== null &&
    branch !== '' &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isInteger(guests) &&
    guests >= 1 &&
    guests <= RESERVATION_MAX_GUESTS;
  if (!usable) {
    return NextResponse.json<DayAvailability>(NOTHING);
  }

  try {
    const { slots, maxSeats, reservationsEnabled } = await api.availability(branch, date, guests);
    return NextResponse.json<DayAvailability>({ slots, maxSeats, reservationsEnabled });
  } catch (error) {
    // A day with no answer is drawn as a day with no times. Onto the server's
    // terminal, never onto the page — which branch or which date failed is a
    // developer's question, and the picker says only that there is nothing
    // here.
    console.error(
      `availability: ${branch} ${date} — ${error instanceof ApiError ? error.message : String(error)}`,
    );
    return NextResponse.json<DayAvailability>(NOTHING);
  }
}
