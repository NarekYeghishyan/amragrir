'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { readyTimeOptions, type Language } from '@amragrir/shared';
import { formatTime } from '@/lib/format';
import { useScripted } from '@/lib/scripted';

/**
 * "Ready at" — when the kitchen should have the food done.
 *
 * The same trade as the booking field, in a smaller way: a bare
 * `<input type="time">` will take 03:00 on a branch that opens at eleven, and
 * the customer only learns otherwise from `POST /orders`. This offers the grid
 * the design draws instead, built from the quote's own `earliestReadyAt` —
 * every option is a time the kitchen has already said it can meet.
 *
 * **Empty is a real answer here**, and the first one: no time means "as soon as
 * it can", which is what `POST /orders` defaults to. A native clock field says
 * that with `--:--`, which says nothing; this says it in words and starts on it.
 *
 * The native field stays underneath for a browser with no JavaScript — same
 * `name`, same `min`, same `step` — and the value posted is the same `HH:mm`
 * Yerevan reading in both modes, so `rememberTiming` is untouched. See
 * `DateTimeField`, which this mirrors.
 */
export function ReadyAtField({
  language,
  name,
  value,
  min,
  step,
  earliestReadyAt,
  label,
  asapLabel,
  hintLabel,
  closeLabel,
}: {
  language: Language;
  name: string;
  /** `HH:mm`, or empty for "as soon as possible". */
  value: string;
  min: string;
  step: number;
  /** The quote's earliest, ISO — the floor the grid is built from. */
  earliestReadyAt: string;
  label: string;
  asapLabel: string;
  hintLabel: string;
  closeLabel: string;
}) {
  const scripted = useScripted();
  const [chosen, setChosen] = useState(value);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // The server's value wins on every re-render, as on the booking field: a
  // re-priced basket can move the earliest ready time, and this control holds a
  // draft rather than a second copy.
  useEffect(() => setChosen(value), [value]);

  const close = useCallback(() => setOpen(false), []);

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

  if (!scripted) {
    return (
      <label className="field">
        <ClockGlyph />
        <input
          className="field-input"
          type="time"
          name={name}
          aria-label={label}
          defaultValue={value}
          min={min}
          step={step}
        />
      </label>
    );
  }

  // `readyTimeOptions` leads with the exact earliest instant and follows it with
  // clean quarter-hours, which is right for the app's grid and one option too
  // many here: the button above **is** that choice, said better. Left in, the
  // panel opened on "As soon as possible / 14:29 / 14:30 / 14:45", where the
  // first two mean the same thing and the pair reads like a rounding bug. So
  // the `earliest` entry is dropped and the grid starts on the clock — the same
  // time `readyFloor` prints in the hint under it.
  const options = readyTimeOptions(earliestReadyAt).filter((option) => !option.earliest);

  return (
    <div className="picker" ref={box}>
      <input type="hidden" name={name} value={chosen} />

      <button
        type="button"
        className={open ? 'field picker-trigger on' : 'field picker-trigger'}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={label}
        onClick={() => setOpen((was) => !was)}
      >
        <ClockGlyph />
        <span className="field-value">
          {chosen ? <strong>{chosen}</strong> : <>⚡ {asapLabel}</>}
        </span>
        <span className="picker-chev" aria-hidden="true">
          ⌄
        </span>
      </button>

      {open && (
        <div className="picker-panel rise" role="dialog" aria-label={label}>
          {/* Drawn first and drawn differently, because it is not one of the
              times — it is the absence of one, and the commonest answer. */}
          <button
            type="button"
            className={chosen === '' ? 'slot wide on' : 'slot wide'}
            aria-pressed={chosen === ''}
            onClick={() => {
              setChosen('');
              close();
            }}
          >
            ⚡ {asapLabel}
          </button>

          {/* The same aligned columns the booking calendar's times use, so the
              two panels on this screen read as one control drawn twice. No
              part-of-day headings here: this grid is two hours of a single
              evening, not a whole day. */}
          <div className="slot-grid ready">
            {options.map((option) => {
              const time = formatTime(option.at);
              return (
                <button
                  type="button"
                  key={option.at}
                  className={chosen === time ? 'slot on' : 'slot'}
                  aria-pressed={chosen === time}
                  onClick={() => {
                    setChosen(time);
                    close();
                  }}
                >
                  {time}
                </button>
              );
            })}
          </div>

          <p className="slot-note" lang={language}>
            {hintLabel}
          </p>

          <button type="button" className="picker-close" onClick={close}>
            {closeLabel}
          </button>
        </div>
      )}
    </div>
  );
}

function ClockGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="var(--accent)" strokeWidth="2" />
      <path
        d="M12 7v5l3 2"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
