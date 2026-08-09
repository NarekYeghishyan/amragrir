'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  AREAS,
  LOCATION_COOKIE,
  areaPlace,
  encodePlace,
  nearestArea,
  parsePlace,
  type Place,
} from '@/lib/locations';
import { readRecents, rememberPlace } from '@/lib/recent-places';
import { useScripted } from '@/lib/scripted';
import { MapPinShape } from '@/components/MapPin';
import { YandexMap } from '@/components/YandexMap';
import { chooseLocation } from '@/app/[lang]/actions';

interface Props {
  language: string;
  /** Whether `GET /[lang]/geocode` has a key behind it. Decided on the server so
   *  the browser never asks a question it already knows the answer to. */
  canGeocode: boolean;
  /** Built on the server, because the language-prefix rule lives there. */
  geocodeEndpoint: string;
  /** Translated up front by the layout: this component runs in the browser and
   *  has no dictionary of its own. */
  labels: {
    all: string;
    heading: string;
    hint: string;
    close: string;
    searchAddress: string;
    searching: string;
    noMatches: string;
    searchFailed: string;
    recent: string;
    pickOnMap: string;
    map: string;
    mapCredit: string;
    zoomIn: string;
    zoomOut: string;
    useCurrent: string;
    confirm: string;
    geoFailed: string;
    areas: Record<string, string>;
  };
}

/** Long enough that typing a street name is one request rather than twelve. */
const TYPING_PAUSE_MS = 350;

/**
 * The header's location control and the dialog behind it, from the design's
 * `locLabel` / `openLoc` row and its `LOCATION PICKER` overlay.
 *
 * A client component for the same reason as `BasketButton`: the choice lives in
 * a cookie, and reading a cookie on the server inside the layout would opt every
 * page — including every pre-rendered restaurant page — out of static rendering.
 * So the server renders the neutral label and the browser fills in the place.
 *
 * **The dialog is a `<details>` with `open` under React's control**, and with
 * JavaScript it is everything a dialog owes its reader — Escape and the scrim
 * close it, focus moves in and comes back, the page behind stops scrolling —
 * around the three things that cannot exist without a browser: **the map**,
 * which is a real one and where any point is choosable; **address search**,
 * through a server route that keeps the geocoder's key off the page; and
 * **"use current location"**.
 *
 * **Without JavaScript there is nothing here to choose with.** The summary still
 * opens the panel natively and the ✕ and "confirm" are still `<form>` submits
 * posting `chooseLocation`, so the panel opens, reads and closes on a page that
 * never ran a line of script — but the district radios that used to be its
 * answer are gone, and every control that replaced them needs a browser. What
 * confirm posts there is an empty place, which is the whole city: the state such
 * a reader was already in. Choosing a location is a scripted feature now.
 *
 * **The map is built only once the dialog is open**, and that is not laziness
 * about a few kilobytes. An `<iframe>` inside a closed `<details>` still loads,
 * so a map left in the markup would fetch Yandex's widget on every page of this
 * site for the great majority of visits that never open this dialog at all.
 *
 * **Selection is pending until confirmed**, as the artifact draws it: tapping
 * the map moves the pin and nothing is stored until the accent button at the
 * bottom. That is one navigation per visit to the dialog rather than one per
 * point tried.
 */
export function LocationPicker({ language, canGeocode, geocodeEndpoint, labels }: Props) {
  const scripted = useScripted();
  const stored = useStoredPlace();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Place | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[] | null>(null);
  const [searching, setSearching] = useState(false);
  /** The search itself broke, as opposed to answering nothing. See the route. */
  const [searchFailed, setSearchFailed] = useState(false);
  const [recents, setRecents] = useState<Place[]>([]);
  const [geoFailed, setGeoFailed] = useState(false);
  const summary = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const cancelForm = useId();

  const label = stored?.label ?? labels.all;
  const areaName = (id: string) => labels.areas[id] ?? id;

  const choose = useCallback((place: Place | null) => {
    setPending(place);
    setGeoFailed(false);
  }, []);

  /**
   * A point off the map, named.
   *
   * The pin moves at once under the visitor's finger and carries the nearest
   * district's name; the geocoder's answer replaces it when it arrives. Waiting
   * for the round trip before moving the pin would make a tap feel ignored, and
   * a point with no name at all cannot be shown in the header afterwards.
   */
  const pickPoint = useCallback(
    (lat: number, lng: number) => {
      const fallback = { lat, lng, label: areaName(nearestArea(lat, lng).id) };
      choose(fallback);
      if (!canGeocode) {
        return;
      }
      fetch(`${geocodeEndpoint}?lat=${lat}&lng=${lng}`, { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : null))
        .then((data: { items?: Place[] } | null) => {
          const found = data?.items?.[0];
          // Only if the pin is still where it was put: a second tap while this
          // was in flight must not be overwritten by the first tap's name.
          setPending((current) =>
            found && current?.lat === lat && current?.lng === lng
              ? { lat, lng, label: found.label }
              : current,
          );
        })
        .catch(() => {
          // The pin keeps the district name it was given. Nothing is lost that
          // the visitor can act on.
        });
    },
    // `areaName` closes over `labels`, which the layout rebuilds per render but
    // whose contents only change with the language — a remount either way.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canGeocode, geocodeEndpoint, choose],
  );

  // Address search, one request per pause in typing.
  useEffect(() => {
    if (!canGeocode || !open) {
      return;
    }
    const text = query.trim();
    if (text === '') {
      setResults(null);
      setSearchFailed(false);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      let live = true;
      fetch(`${geocodeEndpoint}?q=${encodeURIComponent(text)}`, { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : null))
        .then((data: { items?: Place[]; failed?: boolean } | null) => {
          if (live) {
            setResults(data?.items ?? []);
            setSearchFailed(data === null || data.failed === true);
            setSearching(false);
          }
        })
        .catch(() => {
          if (live) {
            setResults([]);
            setSearchFailed(true);
            setSearching(false);
          }
        });
      return () => {
        live = false;
      };
    }, TYPING_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [query, canGeocode, geocodeEndpoint, open]);

  // Opening starts from what is stored, so the dialog always opens on the place
  // the header is showing rather than on whatever was tried and abandoned last
  // time.
  const start = (opening: boolean) => {
    setOpen(opening);
    if (opening) {
      setPending(stored);
      setQuery('');
      setResults(null);
      setSearchFailed(false);
      setGeoFailed(false);
      setRecents(readRecents());
    }
  };

  useBodyLock(open && scripted);

  // Focus goes into the dialog, and comes back to the control that opened it.
  // Not the search box: on a phone that would open the dialog behind a keyboard.
  useEffect(() => {
    if (!scripted) return;
    if (open) {
      dialog.current?.focus();
    } else {
      // Only when this control had focus inside it — a confirm navigates away,
      // and stealing focus back to the header afterwards would be wrong.
      if (dialog.current?.contains(document.activeElement)) summary.current?.focus();
    }
  }, [open, scripted]);

  // Until React is running this, the panel is whatever the server sent, and the
  // server sends a drawing — see `DrawnMap`.
  const useRealMap = scripted && open;

  return (
    <details
      className="locpick"
      open={open}
      onToggle={(event) => start(event.currentTarget.open)}
      onKeyDown={(event) => {
        if (!open) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          setOpen(false);
        }
        // Tab stays inside. Everything behind is under a scrim and cannot be
        // pressed, so tabbing out of the dialog would hand the keyboard a page
        // the mouse has already been shut out of.
        if (event.key === 'Tab' && dialog.current) {
          // `type="hidden"` inputs carry the language and the place the ✕
          // posts, and cannot take focus — landing on one would leave the
          // keyboard exactly where it was.
          const stops = dialog.current.querySelectorAll<HTMLElement>(
            'button, input:not([disabled]):not([type="hidden"])',
          );
          const edge = event.shiftKey ? stops[0] : stops[stops.length - 1];
          if (document.activeElement === edge || document.activeElement === dialog.current) {
            event.preventDefault();
            (event.shiftKey ? stops[stops.length - 1] : stops[0])?.focus();
          }
        }
      }}
    >
      <summary ref={summary} aria-label={labels.heading}>
        <PinIcon />
        <span className="where">{label}</span>
        <svg className="chev" width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M6 9l6 6 6-6"
            stroke="var(--ink3)"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </summary>

      <div className="locpick-overlay">
        {/* Pressing the scrim closes, as the artifact's does. A button rather
            than a div so it is a control at all; hidden from the reading order
            because the ✕ beside it says the same thing out loud. */}
        <button
          type="button"
          className="locpick-scrim"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => setOpen(false)}
        />
        <div
          className="locpick-dialog rise"
          role="dialog"
          aria-modal="true"
          aria-label={labels.heading}
          tabIndex={-1}
          ref={dialog}
        >
          {/* Closing, for a reader with no JavaScript to close anything with:
              a write of the place already stored, which changes nothing and
              redirects back out of the dialog. It is its own form so that the
              ✕ cannot pick up the fields below — the same `form="…"` the
              checkout uses to put a submit outside what it submits. Confirming
              lands on the home page and so does this, because a layout cannot
              know the path it is rendering into without reading the request's
              headers, and that would cost every restaurant page its
              pre-rendering. */}
          <form action={chooseLocation} id={cancelForm} hidden>
            <input type="hidden" name="lang" value={language} />
            <input type="hidden" name="place" value={stored ? encodePlace(stored) : ''} />
          </form>

          <form
            action={chooseLocation}
            className="locpick-form"
            onSubmit={() => {
              if (pending) {
                rememberPlace(pending);
              }
            }}
          >
            <input type="hidden" name="lang" value={language} />
            {/* What the browser chose, whether off the map, a search result, a
                recent place or geolocation. The only field this form posts —
                empty without JavaScript, because nothing below can be answered
                without one. */}
            <input type="hidden" name="place" value={pending ? encodePlace(pending) : ''} />

            <div className="locpick-head">
              <div>
                <strong>{labels.heading}</strong>
                <span>{useRealMap ? labels.pickOnMap : labels.hint}</span>
              </div>
              <button
                type="submit"
                form={cancelForm}
                className="locpick-close"
                aria-label={labels.close}
                onClick={(event) => {
                  if (!scripted) return;
                  event.preventDefault();
                  setOpen(false);
                }}
              >
                ✕
              </button>
            </div>

            <div className="locpick-map">
              <div className="locpick-tools">
                {/* Only with a geocoder behind it. It used to have a second job
                    — with no key, it filtered the district row instead of
                    searching addresses — and that row is gone, so without one
                    there is now nothing for typing here to do. A box that
                    answers nothing is worse than no box: the map below is the
                    way to choose, and it is easier to find with the search out
                    of the way. */}
                {canGeocode && (
                  <div className="locpick-search">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle cx="11" cy="11" r="7" stroke="var(--ink3)" strokeWidth="2" />
                      <path d="M20 20l-3.2-3.2" stroke="var(--ink3)" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    {/* No `name`: this never forms part of what is posted.
                        Disabled until the script that makes it work has arrived
                        — an input that ignores what you type is worse than one
                        that says it is not ready. */}
                    <input
                      type="text"
                      value={query}
                      disabled={!scripted}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder={labels.searchAddress}
                      aria-label={labels.searchAddress}
                    />
                    {query !== '' && (
                      <button
                        type="button"
                        className="locpick-clear"
                        aria-label={labels.close}
                        onClick={() => setQuery('')}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                )}

                {/* Address results, over the map rather than pushing it down —
                    a list that shortened the map every time somebody typed
                    would move the pin they were aiming at. */}
                {canGeocode && query.trim() !== '' && (
                  <ul className="locpick-results">
                    {searching && <li className="locpick-note">{labels.searching}</li>}
                    {!searching && results?.length === 0 && (
                      <li className="locpick-note">
                        {searchFailed ? labels.searchFailed : labels.noMatches}
                      </li>
                    )}
                    {!searching &&
                      results?.map((place) => (
                        <li key={`${place.lat},${place.lng},${place.label}`}>
                          <button
                            type="button"
                            className="locpick-result"
                            onClick={() => {
                              choose(place);
                              setQuery('');
                            }}
                          >
                            <PinIcon size={14} tint="var(--ink3)" />
                            <span className="locpick-chip-text">{place.label}</span>
                          </button>
                        </li>
                      ))}
                  </ul>
                )}

                {/* Where this browser has been before. Only ever present with
                    JavaScript, which is also the only way to have made one of
                    these choices. */}
                {recents.length > 0 && query.trim() === '' && (
                  <div className="locpick-chips" role="group" aria-label={labels.recent}>
                    <span className="locpick-chips-label">{labels.recent}</span>
                    {recents.map((place) => (
                      <button
                        type="button"
                        key={`${place.lat},${place.lng},${place.label}`}
                        className={
                          same(pending, place) ? 'locpick-area locpick-recent on' : 'locpick-area locpick-recent'
                        }
                        aria-pressed={same(pending, place)}
                        onClick={() => choose(place)}
                      >
                        <ClockIcon />
                        <span className="locpick-chip-text">{place.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {useRealMap ? (
                <YandexMap
                  language={language}
                  value={pending}
                  onPick={pickPoint}
                  labels={{
                    map: labels.map,
                    credit: labels.mapCredit,
                    zoomIn: labels.zoomIn,
                    zoomOut: labels.zoomOut,
                  }}
                />
              ) : (
                <DrawnMap
                  areas={AREAS}
                  pending={pending}
                  onPick={(area) => choose(areaPlace(area, areaName(area.id)))}
                />
              )}

              <p className="locpick-selected">
                <span aria-hidden="true" />
                {pending?.label ?? labels.all}
                {/* The way back out. Every control in here narrows the listing to
                    a point, and the "all districts" radio was what widened it
                    again until that row was removed — so the un-choose moves
                    here, onto the thing that names the choice. Without it a
                    visitor who picked a place once could never get back to the
                    whole city. */}
                {pending !== null && (
                  <button
                    type="button"
                    className="locpick-unset"
                    aria-label={labels.all}
                    onClick={() => choose(null)}
                  >
                    ✕
                  </button>
                )}
              </p>
            </div>

            <div className="locpick-foot">
              {/* Geolocation is a browser permission prompt, so this control
                  cannot exist before the browser does. With a geocoder behind
                  it the point gets its real address; without one it is named
                  after the nearest district. */}
              {scripted && (
                <button
                  type="button"
                  className="locpick-here"
                  onClick={() =>
                    navigator.geolocation?.getCurrentPosition(
                      (position) => {
                        setQuery('');
                        pickPoint(position.coords.latitude, position.coords.longitude);
                      },
                      // Refused, unavailable or timed out — all three leave the
                      // map and the search box as the way to answer, so this
                      // says so and gets out of the way.
                      () => setGeoFailed(true),
                    )
                  }
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="4" stroke="var(--accent)" strokeWidth="2" />
                    <path
                      d="M12 2v3M12 19v3M2 12h3M19 12h3"
                      stroke="var(--accent)"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                  {labels.useCurrent}
                </button>
              )}
              <button type="submit" className="locpick-confirm">
                {labels.confirm}
              </button>
            </div>
            {geoFailed && (
              <p className="locpick-error" role="status">
                {labels.geoFailed}
              </p>
            )}
          </form>
        </div>
      </div>
    </details>
  );
}

/**
 * The artifact's drawn map, which is what the panel holds until a real one can
 * exist: before hydration, and for good on a page with no JavaScript.
 *
 * It is not a fallback for a *broken* map — a cross-origin frame cannot report
 * that it failed to load, so nothing here can honestly claim to know. It is the
 * placeholder for a map that has not been built yet, and the reason the no-JS
 * dialog is a dialog rather than a hole.
 *
 * Decoration. The pins take a click, but this drawing is only ever on the screen
 * where that click cannot land — before hydration, and on a page with no
 * JavaScript — so nothing here is a way to choose a district; the real map is.
 * They stay hidden from assistive technology: the drawing is a city, not
 * Yerevan, so there is nothing on it to read.
 *
 * `meet`, where the artifact writes `slice`. Its map is drawn 400×340 into a
 * panel twice as wide as it is tall, and slicing that crops 45% of the height —
 * taking Cascade's and Shengavit's pins off the screen with it. So the drawing
 * is fitted rather than cropped, and every street runs well past the viewBox on
 * both axes to fill whatever margin fitting leaves; `.locpick-canvas` clips them.
 */
function DrawnMap({
  areas,
  pending,
  onPick,
}: {
  areas: readonly (typeof AREAS)[number][];
  pending: Place | null;
  onPick: (area: (typeof AREAS)[number]) => void;
}) {
  return (
    <div className="locpick-canvas locpick-drawn">
      <svg viewBox="0 0 400 340" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <rect x="-800" y="-680" width="2000" height="1700" fill="var(--placeholder)" />
        <path
          d="M-820 250 Q120 210 200 250 T1240 240 L1240 1020 L-820 1020Z"
          fill="var(--placeholder2)"
          opacity=".7"
        />
        <g stroke="var(--line)" strokeWidth="7" fill="none" opacity=".9">
          <path d="M-800 120 H1200" />
          <path d="M-800 210 H1200" />
          <path d="M110 -680 V1020" />
          <path d="M250 -680 V1020" />
          <path d="M40 0 L360 340" strokeWidth="5" />
        </g>
        <g stroke="var(--line)" strokeWidth="3" fill="none" opacity=".55">
          <path d="M-800 65 H1200" />
          <path d="M-800 165 H1200" />
          <path d="M-800 270 H1200" />
          <path d="M180 -680 V1020" />
          <path d="M320 -680 V1020" />
        </g>
        <circle cx="200" cy="150" r="52" fill="var(--accent-soft)" opacity=".6" />
        {areas.map((area) => {
          const on = pending !== null && pending.lat === area.lat && pending.lng === area.lng;
          return (
            <g
              key={area.id}
              className="locpick-pin"
              transform={`translate(${area.mapX} ${area.mapY}) scale(${on ? 1.5 : 1})`}
              onClick={() => onPick(area)}
            >
              <MapPinShape fill={on ? 'var(--accent)' : 'var(--ink3)'} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function PinIcon({ size = 16, tint = 'var(--accent)' }: { size?: number; tint?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 21s7-5.7 7-11a7 7 0 10-14 0c0 5.3 7 11 7 11z" stroke={tint} strokeWidth="2" />
      <circle cx="12" cy="10" r="2.4" stroke={tint} strokeWidth="2" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7v5.2l3.2 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Two places are the same choice when they are the same point. Names differ —
 *  the geocoder's answer for a district centre is a street, not "Kentron" — and
 *  a chip must still light up when the point behind it is the pending one. */
function same(a: Place | null, b: Place | null): boolean {
  return a !== null && b !== null && a.lat === b.lat && a.lng === b.lng;
}

/**
 * The stored place, read after mount.
 *
 * Starts at null — the whole city — because the server rendered this page once
 * for everybody and any other starting value would hydrate into a mismatch.
 */
function useStoredPlace(): Place | null {
  const [place, setPlace] = useState<Place | null>(null);

  useEffect(() => {
    const read = () => {
      const match = document.cookie.match(new RegExp(`(?:^|; )${LOCATION_COOKIE}=([^;]*)`));
      setPlace(parsePlace(match ? match[1] : undefined));
    };
    read();
    // A Server Action responds with a navigation rather than a storage event,
    // so re-read on the events that follow one.
    window.addEventListener('pageshow', read);
    window.addEventListener('focus', read);
    return () => {
      window.removeEventListener('pageshow', read);
      window.removeEventListener('focus', read);
    };
  }, []);

  return place;
}

/** Holds the page still behind the dialog. Restores whatever was there rather
 *  than clearing it, so nothing else that sets `overflow` is trampled. */
function useBodyLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [locked]);
}
