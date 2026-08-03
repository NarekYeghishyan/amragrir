import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { RESERVATION_MAX_GUESTS, ServiceMode } from '@amragrir/shared';
import { api } from '@/lib/api';
import { parseLanguage, t } from '@/lib/language';
import { formatAmd, formatDay, formatTime, yerevanDate } from '@/lib/format';
import { readyTimeOptions } from '@/lib/ready-times';
import { loadBasket } from '@/lib/basket';
import { ORDER_ROBOTS, cartPath, checkoutPath, preorderPath } from '@/lib/site';
import { bookTable, chooseReadyAt, chooseServiceMode } from '../actions';

export const metadata: Metadata = { title: 'When & how', robots: ORDER_ROBOTS };
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ lang: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PreorderPage({ params, searchParams }: Props) {
  const [{ lang }, sp] = await Promise.all([params, searchParams]);
  const language = parseLanguage(lang);
  if (!language) {
    notFound();
  }
  const label = t(language);

  const basket = await loadBasket(language, preorderPath(language));
  if (!basket) {
    redirect(cartPath(language));
  }
  const { cart, quote } = basket;

  const dineIn = cart.serviceMode === ServiceMode.DineIn;
  const guests = Number(sp.guests ?? 2);
  const date = typeof sp.date === 'string' ? sp.date : yerevanDate(new Date());

  // Only fetched for dine-in: a pickup basket has no use for table times, and
  // the call would be a round trip spent on markup nobody sees.
  const availability = dineIn
    ? await api.availability(cart.branchId, date, guests)
    : null;

  const readyTimes = readyTimeOptions(quote.earliestReadyAt);

  return (
    <>
      <Link className="back" href={cartPath(language)}>
        ← {label('basket')}
      </Link>

      <h1>{label('whenAndHow')}</h1>
      <p className="lede">
        {quote.restaurantName} · {quote.prepMin} {label('minutes')}
      </p>

      {sp.error === 'slot_taken' && <p className="notice warn">{label('noSlots')}</p>}

      {/* Mode. Two forms rather than a toggle, because switching mode is a
          server-side change — it drops any table booking that no longer
          applies — and must survive JavaScript being off. */}
      <div className="modes">
        {[
          { mode: ServiceMode.Pickup, name: 'modePickup', hint: 'modePickupHint', icon: '🥡' },
          { mode: ServiceMode.DineIn, name: 'modeDineIn', hint: 'modeDineInHint', icon: '🍽️' },
        ].map((option) => (
          <form action={chooseServiceMode} key={option.mode}>
            <input type="hidden" name="lang" value={language} />
            <input type="hidden" name="serviceMode" value={option.mode} />
            <button
              type="submit"
              className={cart.serviceMode === option.mode ? 'mode on' : 'mode'}
              aria-pressed={cart.serviceMode === option.mode}
            >
              <span className="emoji" aria-hidden="true">
                {option.icon}
              </span>
              <span className="name">{label(option.name as 'modePickup')}</span>
              <span className="hint">{label(option.hint as 'modePickupHint')}</span>
            </button>
          </form>
        ))}
      </div>

      {dineIn && availability && (
        <section className="booking">
          {!availability.reservationsEnabled ? (
            <p className="notice warn">{label('reservationsOff')}</p>
          ) : (
            <>
              <h2 className="section-label">{label('reservationDate')}</h2>
              {/* Day pager and guest count are links, not a calendar widget:
                  they change what the server must fetch, so they are a GET with
                  the state in the URL — shareable, back-buttonable, no JS. */}
              <nav className="daypager" aria-label={label('reservationDate')}>
                {[0, 1, 2, 3, 4, 5, 6].map((offset) => {
                  const day = new Date(Date.now() + offset * 86_400_000);
                  const value = yerevanDate(day);
                  return (
                    <Link
                      key={value}
                      className={value === date ? 'day on' : 'day'}
                      href={`${preorderPath(language)}?date=${value}&guests=${guests}`}
                    >
                      {formatDay(day.toISOString(), language)}
                    </Link>
                  );
                })}
              </nav>

              <h2 className="section-label">{label('guests')}</h2>
              <ul className="guestpicker">
                {Array.from(
                  { length: Math.min(RESERVATION_MAX_GUESTS, availability.maxSeats || 8) },
                  (_, index) => index + 1,
                ).map((count) => (
                  <li key={count}>
                    <Link
                      className={count === guests ? 'guest on' : 'guest'}
                      href={`${preorderPath(language)}?date=${date}&guests=${count}`}
                    >
                      {count}
                    </Link>
                  </li>
                ))}
              </ul>

              <h2 className="section-label">{label('reservationTime')}</h2>
              {availability.slots.length === 0 ? (
                <p className="notice">{label('noSlots')}</p>
              ) : (
                <div className="slots">
                  {availability.slots.map((slot) => (
                    <form action={bookTable} key={slot.at}>
                      <input type="hidden" name="lang" value={language} />
                      <input type="hidden" name="reservedFor" value={slot.at} />
                      <input type="hidden" name="guests" value={guests} />
                      <button type="submit" className="slot" disabled={!slot.available}>
                        {slot.time}
                      </button>
                    </form>
                  ))}
                </div>
              )}

              <div className="deposit-card">
                <div className="row">
                  <span>{label('deposit')}</span>
                  <strong>{formatAmd(availability.depositAmd)}</strong>
                </div>
                <p>{label('depositCredited')}</p>
              </div>

              {cart.reservationId && (
                <p className="notice good">
                  ✓ {label('tableBooked')}
                  {quote.tableNo ? ` · ${label('atTable')} ${quote.tableNo}` : ''}
                </p>
              )}
            </>
          )}
        </section>
      )}

      <h2 className="section-label">{label('readyAtLabel')}</h2>
      <div className="slots">
        <form action={chooseReadyAt}>
          <input type="hidden" name="lang" value={language} />
          <input type="hidden" name="readyAt" value="" />
          <button type="submit" className={cart.readyAt ? 'slot' : 'slot on'}>
            ⚡ {label('asSoonAsPossible')}
          </button>
        </form>
        {readyTimes.map((time) => (
          <form action={chooseReadyAt} key={time.at}>
            <input type="hidden" name="lang" value={language} />
            <input type="hidden" name="readyAt" value={time.at} />
            <button type="submit" className={cart.readyAt === time.at ? 'slot on' : 'slot'}>
              {formatTime(time.at)}
            </button>
          </form>
        ))}
      </div>

      {/* Dine-in without a table is the one combination `POST /orders` refuses
          outright, so the step is blocked here rather than at the payment. */}
      {dineIn && !cart.reservationId ? (
        <p className="notice warn">{label('bookTable')}</p>
      ) : (
        <Link className="sticky-cta" href={checkoutPath(language)}>
          <span>{label('continueToCheckout')}</span>
          <span>{formatAmd(quote.dueNowAmd)}</span>
        </Link>
      )}
    </>
  );
}
