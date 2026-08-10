'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  monthGrid,
  monthHasBookableDay,
  upcomingSlots,
  type Language,
} from '@amragrir/shared';
import { formatDay, formatTime, instantOfYerevan, yerevanDateTime } from '@/lib/format';
import { useScripted } from '@/lib/scripted';
import type { Slot } from '@/lib/api';
import type { DayAvailability } from '@/app/[lang]/availability/route';

/**
 * "Date & time" — the checkout's booking control.
 *
 * **It was a bare `<input type="datetime-local">`**, and that field had one
 * flaw the design had warned about: it can name a time the restaurant will not
 * take. A field offers every half hour on the calendar, including Mondays the
 * branch is shut and evenings with no free table, so `POST /reservations`
 * refused them and the screen drew a message afterwards. Asking and being told
 * no is a worse way to pick a time than being shown the ones that exist.
 *
 * So the design's own control is back on the web: a month grid, Monday first,
 * with days outside the booking window greyed rather than hidden — and under it
 * the **slot grid the API answers with**, so nothing offered here can be
 * refused for being closed, off the half-hour or already taken. The refusal
 * path stays regardless: a table can go while somebody is deciding, which is
 * exactly the case `submitCheckout` still catches.
 *
 * **The native field is still underneath it.** Until React has hydrated — and
 * for a browser that never will — this renders exactly the field it always did,
 * with the same `name`, `min`, `max` and `step`, so the no-JavaScript path
 * books a table exactly as it did before. `useScripted` is what flips it, one
 * commit after mount, which is also what keeps the first client render
 * identical to the server's.
 *
 * The value it posts is unchanged in either mode: a `YYYY-MM-DDTHH:mm` Yerevan
 * reading under the same field name, so `rememberTiming` and `bookTable` never
 * learn that the control changed.
 */
export function DateTimeField({
  language,
  name,
  value,
  min,
  max,
  step,
  today,
  horizonDays,
  branchId,
  guests,
  endpoint,
  label,
  noSlotsLabel,
  closeLabel,
  chooseLabel,
}: {
  language: Language;
  name: string;
  /** `YYYY-MM-DDTHH:mm`, the value the field opens on. */
  value: string;
  min: string;
  max: string;
  step: number;
  /** Yerevan's date, so "past" means past where the restaurant is. */
  today: string;
  /** How far ahead this screen may book — the page's ceiling, not the calendar's. */
  horizonDays: number;
  branchId: string;
  guests: number;
  /** `availabilityApiPath(language)` — built on the server, see `lib/site.ts`. */
  endpoint: string;
  label: string;
  noSlotsLabel: string;
  closeLabel: string;
  chooseLabel: string;
}) {
  const scripted = useScripted();
  const [chosen, setChosen] = useState(value);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);

  // The page re-renders on every guest change and every mode switch, and the
  // server may have moved the time under us (`setServiceMode` drops it). Its
  // answer wins: this control's state is a draft of the server's value, never a
  // second source of it.
  useEffect(() => setChosen(value), [value]);

  const day = chosen.slice(0, 10) || today;
  const [month, setMonth] = useState(() => ({
    year: Number(day.slice(0, 4)),
    month: Number(day.slice(5, 7)) - 1,
  }));

  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [loading, setLoading] = useState(false);

  // Only while the panel is open: a checkout that never opens it should not
  // spend a request, and the day it would ask about is the one already drawn.
  useEffect(() => {
    if (!open) {
      return;
    }
    const abort = new AbortController();
    setLoading(true);
    const query = new URLSearchParams({ branch: branchId, date: day, guests: String(guests) });
    fetch(`${endpoint}?${query}`, { signal: abort.signal })
      .then((response) => (response.ok ? (response.json() as Promise<DayAvailability>) : null))
      .then((answer) => setSlots(answer?.slots ?? []))
      .catch(() => {
        // An aborted request is the next one starting, not a failure to draw.
        if (!abort.signal.aborted) {
          setSlots([]);
        }
      })
      .finally(() => {
        if (!abort.signal.aborted) {
          setLoading(false);
        }
      });
    // Braced rather than `() => abort.abort()`: the shorthand *returns* the
    // call's `void`, which reads as a cleanup that means something and which
    // stricter lint configs (`no-confusing-void-expression`) reject outright.
    return () => {
      abort.abort();
    };
  }, [open, day, guests, branchId, endpoint]);

  const close = useCallback(() => setOpen(false), []);

  /** The two arrows, in rows rather than pixels — a scroll that lands
   *  mid-row reads as a rendering fault rather than a scroll. */
  const nudge = useCallback((direction: 1 | -1) => {
    const scroller = list.current;
    const row = scroller?.querySelector('.time-row');
    if (!scroller || !row) {
      return;
    }
    scroller.scrollBy({ top: direction * row.clientHeight * 3, behavior: 'smooth' });
  }, []);

  // Opening on a time already chosen must show it, and a day whose free tables
  // all sit in the evening opens scrolled to the top with nothing selected in
  // sight. `block: 'nearest'` keeps a chosen row that is already visible
  // exactly where it is instead of centring it under the cursor.
  useEffect(() => {
    if (!open) {
      return;
    }
    list.current?.querySelector('.time-row.on')?.scrollIntoView({ block: 'nearest' });
  }, [open, chosen, slots]);

  // Escape, and a press anywhere else. Both are what a panel like this is
  // expected to answer to, and neither is worth a library.
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
      }
    };
    const onDown = (event: PointerEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) {
        close();
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open, close]);

  // The field, exactly as it was, until React is driving. This is the whole
  // no-JavaScript path — and the first client render, so hydration matches.
  if (!scripted) {
    return (
      <label className="field">
        <CalendarGlyph />
        <input
          className="field-input"
          type="datetime-local"
          name={name}
          aria-label={label}
          defaultValue={value}
          min={min}
          max={max}
          step={step}
          required
        />
      </label>
    );
  }

  const iso = instantOfYerevan(chosen);
  // Read at render, which only happens in the browser — everything above the
  // `scripted` gate returned already, so there is no server clock to disagree
  // with and no hydration to mismatch.
  const times = upcomingSlots(slots ?? [], new Date().toISOString());
  const cells = monthGrid(month.year, month.month, today, horizonDays);
  const canGoBack = monthHasBookableDay(month.year, month.month - 1, today, horizonDays);
  const canGoForward = monthHasBookableDay(month.year, month.month + 1, today, horizonDays);
  const monthName = new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : language, {
    timeZone: 'Asia/Yerevan',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(month.year, month.month, 1)));

  return (
    <div className="picker" ref={box}>
      {/* What travels with the form. The visible control is a button, and a
          button posts nothing. */}
      <input type="hidden" name={name} value={chosen} />

      <button
        type="button"
        className={open ? 'field picker-trigger on' : 'field picker-trigger'}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={label}
        onClick={() => setOpen((was) => !was)}
      >
        <CalendarGlyph />
        <span className="field-value">
          {iso ? (
            <>
              <strong>{formatDay(iso, language)}</strong> · {formatTime(iso)}
            </>
          ) : (
            chooseLabel
          )}
        </span>
        <span className="picker-chev" aria-hidden="true">
          ⌄
        </span>
      </button>

      {open && (
        <div className="picker-panel rise" role="dialog" aria-label={label}>
          {/* Month on the left, times in a column on the right — the shape of
              every desktop date-and-time picker, and the one thing a grid under
              the calendar could not do: show *when* beside *which day*, so
              moving between them is a glance rather than a scroll. */}
          <div className="picker-split">
          <div className="cal-side">
          <div className="cal-head">
            <button
              type="button"
              className="cal-arrow"
              disabled={!canGoBack}
              aria-label={`${monthName} −`}
              onClick={() =>
                setMonth((m) =>
                  m.month === 0 ? { year: m.year - 1, month: 11 } : { ...m, month: m.month - 1 },
                )
              }
            >
              ‹
            </button>
            <span className="cal-month" aria-live="polite">
              {monthName}
            </span>
            <button
              type="button"
              className="cal-arrow"
              disabled={!canGoForward}
              aria-label={`${monthName} +`}
              onClick={() =>
                setMonth((m) =>
                  m.month === 11 ? { year: m.year + 1, month: 0 } : { ...m, month: m.month + 1 },
                )
              }
            >
              ›
            </button>
          </div>

          <div className="cal-week" aria-hidden="true">
            {weekdayNames(language).map((weekday, index) => (
              <span key={index}>{weekday}</span>
            ))}
          </div>

          <div className="cal-grid">
            {cells.map((cell, index) =>
              cell.date === null ? (
                <span className="cal-cell blank" key={index} />
              ) : (
                <button
                  type="button"
                  key={cell.date}
                  className={cellClass(cell.date, day, today)}
                  disabled={!cell.bookable}
                  aria-pressed={cell.date === day}
                  // Keeps the time and moves the day, so paging around the
                  // calendar does not silently reset a time already chosen.
                  onClick={() => setChosen(`${cell.date}T${chosen.slice(11, 16) || '19:00'}`)}
                >
                  {cell.day}
                </button>
              ),
            )}
          </div>

          </div>

          {/* The times the API says exist for that day and that party. Nothing
              here can be refused for being shut, off the grid or too small —
              only for having gone while somebody decided. The times already
              past are dropped; see `booking-slots.ts` in `@amragrir/shared` for
              why past and taken are not the same state. */}
          <div className="time-side">
            <button
              type="button"
              className="time-arrow"
              aria-label={`${label} ▲`}
              onClick={() => nudge(-1)}
            >
              ▲
            </button>

            <div
              className={loading ? 'time-scroll settling' : 'time-scroll'}
              ref={list}
              aria-busy={loading}
            >
              {times.map((slot) => {
                  const isChosen = chosen.slice(11, 16) === slot.time;
                  return (
                    <button
                      type="button"
                      key={slot.at}
                      className={isChosen ? 'time-row on' : 'time-row'}
                      /* Disabled while a new day is in flight, not merely
                         dimmed. These are the *previous* day's times until the
                         answer lands, and pressing one booked the day the
                         calendar had already stopped showing. Dimming alone
                         would not have stopped a keyboard reaching it, so the
                         buttons are shut rather than the block sealed with
                         `pointer-events`. */
                      disabled={!slot.available || loading}
                      aria-pressed={isChosen}
                      onClick={() => {
                        setChosen(yerevanDateTime(slot.at));
                        close();
                      }}
                    >
                      {slot.time}
                    </button>
                  );
              })}
            </div>

            <button
              type="button"
              className="time-arrow"
              aria-label={`${label} ▼`}
              onClick={() => nudge(1)}
            >
              ▼
            </button>
          </div>
          </div>

          {/* Under the split rather than inside the time column: the column is
              82px wide, and a sentence set in it wraps to five ragged lines. */}
          {times.length === 0 && !loading && slots !== null && (
            <p className="slot-empty">{noSlotsLabel}</p>
          )}

          <button type="button" className="picker-close" onClick={close}>
            {closeLabel}
          </button>
        </div>
      )}
    </div>
  );
}

function cellClass(date: string, chosenDay: string, today: string): string {
  const marks = ['cal-cell'];
  if (date === chosenDay) {
    marks.push('on');
  }
  if (date === today) {
    marks.push('today');
  }
  return marks.join(' ');
}

/** Mon…Sun in the language being read, from the platform rather than a
 *  dictionary — a weekday abbreviation is not a product string. */
function weekdayNames(language: string): string[] {
  const format = new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : language, {
    timeZone: 'UTC',
    weekday: 'short',
  });
  // 2026-01-05 is a Monday, which is where Armenia's week starts.
  return Array.from({ length: 7 }, (_, index) =>
    format.format(new Date(Date.UTC(2026, 0, 5 + index))),
  );
}

function CalendarGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="3" stroke="var(--accent)" strokeWidth="2" />
      <path
        d="M3 9h18M8 3v4M16 3v4"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
