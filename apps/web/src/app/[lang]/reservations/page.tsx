import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { RESERVATION_STATUS_LABEL } from '@amragrir/i18n';
import { api, ApiError, type Reservation } from '@/lib/api';
import { parseLanguage, t } from '@/lib/language';
import { readSession } from '@/lib/session';
import {
  ORDER_ROBOTS,
  homePath,
  reservationPath,
  reservationsPath,
  sessionPath,
  signinPath,
} from '@/lib/site';

export const metadata: Metadata = { title: 'My bookings', robots: ORDER_ROBOTS };
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ lang: string }>;
}

/**
 * The visitor's own tables.
 *
 * Built alongside booking-without-a-basket, because without it a booking made
 * here could never be looked at or given back: `GET /reservations` and
 * `POST /reservations/{id}/cancel` had existed the whole time with nothing on
 * the web calling either.
 *
 * Two lists rather than one, and the API decides which is which — `upcoming` is
 * every active status and `past` every terminal one. Splitting them here from a
 * status would be this screen and the back office disagreeing about whether a
 * booking is over.
 */
export default async function ReservationsPage({ params }: Props) {
  const { lang } = await params;
  const language = parseLanguage(lang);
  if (!language) {
    notFound();
  }
  const label = t(language);

  // A booking belongs to a verified account, so a visitor with no session is
  // sent to sign in rather than through `/session` — the same reasoning as
  // `/orders`: minting a guest here would buy nothing, since a guest has none.
  const session = await readSession();
  if (!session || !session.verified) {
    redirect(signinPath(language, reservationsPath(language)));
  }

  let upcoming: { items: Reservation[] };
  let past: { items: Reservation[] };
  try {
    [upcoming, past] = await Promise.all([
      api.reservations('upcoming', session.accessToken, language),
      api.reservations('past', session.accessToken, language),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect(sessionPath(language, reservationsPath(language)));
    }
    throw error;
  }

  return (
    <>
      <h1>{label('myReservations')}</h1>

      <h2 className="section-label">{label('reservationsUpcoming')}</h2>
      {upcoming.items.length === 0 ? (
        <p className="notice">{label('noUpcomingReservations')}</p>
      ) : (
        <ul className="order-list">
          {upcoming.items.map((reservation) => (
            <ReservationRow key={reservation.id} reservation={reservation} language={language} />
          ))}
        </ul>
      )}

      <h2 className="section-label">{label('reservationsPast')}</h2>
      {past.items.length === 0 ? (
        <p className="notice">{label('noPastReservations')}</p>
      ) : (
        <ul className="order-list">
          {past.items.map((reservation) => (
            <ReservationRow key={reservation.id} reservation={reservation} language={language} />
          ))}
        </ul>
      )}

      <Link className="ghost-action" href={homePath(language)}>
        {label('browseRestaurants')}
      </Link>
    </>
  );
}

function ReservationRow({
  reservation,
  language,
}: {
  reservation: Reservation;
  language: string;
}) {
  const label = t(language as Parameters<typeof t>[0]);
  return (
    <li>
      <Link className="order-row" href={reservationPath(language, reservation.id)}>
        <span className="who">
          <span className="name">{reservation.restaurantName}</span>
          {/* The day and time come formatted by the API, in Yerevan's clock —
              the restaurant's day, not the reader's. */}
          <span className="meta">
            {reservation.localDate} · {reservation.localTime} · {reservation.guests}{' '}
            {label('guestsWord')}
          </span>
        </span>
        <span className="status">
          {label(
            RESERVATION_STATUS_LABEL[
              reservation.status as keyof typeof RESERVATION_STATUS_LABEL
            ] ?? 'resStatusPending',
          )}
        </span>
      </Link>
    </li>
  );
}
