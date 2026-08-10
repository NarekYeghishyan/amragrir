import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ReservationStatus, isReservationCancellable } from '@amragrir/shared';
import { RESERVATION_STATUS_LABEL, depositLabelFor } from '@amragrir/i18n';
import { api, ApiError, type Reservation } from '@/lib/api';
import { parseLanguage, t } from '@/lib/language';
import { formatAmd, formatTime } from '@/lib/format';
import { readSession } from '@/lib/session';
import {
  ORDER_ROBOTS,
  orderPath,
  reservationPath,
  reservationsPath,
  sessionPath,
  signinPath,
} from '@/lib/site';
import { cancelReservation } from '../../actions';

export const metadata: Metadata = { title: 'Booking', robots: ORDER_ROBOTS };
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ lang: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * One table, and the button that gives it back.
 *
 * **What the deposit did is reported, not computed.** `depositCredited` and the
 * status both arrive settled — the API decided with `depositOutcomeFor` in
 * `shared`, the same function the owner panel's no-show path calls. Working it
 * out here would be a second copy of a rule about somebody's money.
 *
 * A booking made with a basket links to its order; one booked on its own says
 * so and offers nothing, because there is nothing to link to.
 */
export default async function ReservationPage({ params, searchParams }: Props) {
  const [{ lang, id }, sp] = await Promise.all([params, searchParams]);
  const language = parseLanguage(lang);
  if (!language) {
    notFound();
  }
  const label = t(language);

  const session = await readSession();
  if (!session || !session.verified) {
    redirect(signinPath(language, reservationPath(language, id)));
  }

  let reservation: Reservation;
  try {
    reservation = await api.reservation(id, session.accessToken, language);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect(sessionPath(language, reservationPath(language, id)));
    }
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  const cancellable = isReservationCancellable(reservation.status as ReservationStatus);
  const stillFree =
    reservation.freeCancellationUntil !== null &&
    new Date(reservation.freeCancellationUntil).getTime() > Date.now();
  const error = typeof sp.error === 'string' ? sp.error : undefined;

  return (
    <>
      <Link className="back" href={reservationsPath(language)}>
        ← {label('myReservations')}
      </Link>

      <h1>{reservation.restaurantName}</h1>
      <p className="lede">
        {reservation.localDate} · {reservation.localTime}
      </p>

      {error && <p className="notice warn">{label('cancelFailed')}</p>}
      {reservation.status === ReservationStatus.Cancelled && (
        <p className="notice">{label('reservationCancelled')}</p>
      )}

      <div className="deposit-card">
        <div className="row">
          <span>{label('reservationFor')}</span>
          <strong>
            {reservation.guests} {label('guestsWord')}
          </strong>
        </div>
        {reservation.tableNo && (
          <div className="row">
            <span>{label('atTable')}</span>
            <strong>{reservation.tableNo}</strong>
          </div>
        )}
        <div className="row">
          <span>{label(depositLabelFor(reservation.status, reservation.depositCredited))}</span>
          <strong>{formatAmd(reservation.depositAmd)}</strong>
        </div>
        <div className="row">
          <span>
            {label(
              RESERVATION_STATUS_LABEL[
                reservation.status as keyof typeof RESERVATION_STATUS_LABEL
              ] ?? 'resStatusPending',
            )}
          </span>
          <strong>
            {reservation.orderId ? label('reservationWith') : label('reservationAlone')}
          </strong>
        </div>
      </div>

      {reservation.branch.address && <p className="field-hint">{reservation.branch.address}</p>}

      {reservation.orderId && (
        <Link className="ghost-action" href={orderPath(language, reservation.orderId)}>
          {label('orderNumber')} →
        </Link>
      )}

      {cancellable && (
        <form action={cancelReservation}>
          <input type="hidden" name="lang" value={language} />
          <input type="hidden" name="reservationId" value={reservation.id} />
          {/* Says what cancelling costs before it is pressed. The window comes
              from the API (`freeCancellationUntil`); after it, the deposit is
              kept — which is the whole reason a deposit exists. */}
          <p className="field-hint">
            {stillFree && reservation.freeCancellationUntil
              ? `${label('cancelFree')} ${formatTime(reservation.freeCancellationUntil)}`
              : label('cancelCostsDeposit')}
          </p>
          <button className="line-remove" type="submit">
            {label('cancelReservation')}
          </button>
        </form>
      )}
    </>
  );
}
