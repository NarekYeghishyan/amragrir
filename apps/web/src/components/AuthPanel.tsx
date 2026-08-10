'use client';

import { useState, type MouseEvent } from 'react';
import type { CountryOption, Language } from '@amragrir/shared';
import { PhoneField } from './PhoneField';

/** Every string the panel draws, in the language the page was rendered in. */
export interface AuthLabels {
  loginHead: string;
  registerHead: string;
  loginTab: string;
  registerTab: string;
  loginCta: string;
  registerCta: string;
  name: string;
  namePlaceholder: string;
  phone: string;
  country: string;
  phoneInvalid: string;
  otpNote: string;
}

/**
 * The sign-in card's first step — the Log in / Sign up tabs and the form under
 * them.
 *
 * **The tabs are still links to `?mode=register`.** That is the whole
 * no-JavaScript path and it is unchanged: the href is real, the server renders
 * the tab the query string names, and a browser without a client navigates to
 * it exactly as it did before.
 *
 * What mounting adds is that the press stops being a navigation. The two tabs
 * choose a *field*, not an endpoint (see the page) — the only difference
 * between them is whether "Full name" shows and what the heading and the button
 * say, all of which this component already holds. Routing that through the
 * server meant a full round trip to a `force-dynamic` page to show one input:
 * the card was torn down and rebuilt, its entry animation replayed, and
 * anything already typed into the number field went with it. Now the switch is
 * a `useState` and the address is corrected behind it.
 *
 * **The name field is hidden, not unmounted.** Someone who types a name, looks
 * at the log-in tab and comes back should find it still there; unmounting the
 * input would drop what they typed. It posts on both tabs as a result, which
 * costs nothing — `requestCode` reads `name` only when `mode` is `register`,
 * so a name arriving from the log-in tab is a name nobody typed and is ignored
 * there, exactly as it was when the field did not exist.
 */
export function AuthPanel({
  language,
  next,
  initialRegister,
  loginHref,
  registerHref,
  name,
  countries,
  defaultCountry,
  phoneError,
  labels,
  action,
}: {
  language: Language;
  /** Where a confirmed number returns to; travels through both steps. */
  next: string;
  /** The tab the URL asked for — the server's answer, and the starting state. */
  initialRegister: boolean;
  loginHref: string;
  registerHref: string;
  /** A name carried back by a bounce, so a half-filled sign-up survives it. */
  name: string;
  countries: CountryOption[];
  defaultCountry: string;
  /** Whether the last submit came back with `?error=phone`. */
  phoneError: boolean;
  labels: AuthLabels;
  /** `requestCode` — the form's own action, and the only way off this step. */
  action: (formData: FormData) => Promise<void>;
}) {
  const [register, setRegister] = useState(initialRegister);
  // The refusal on the URL belongs to the number that was just sent. Switching
  // tab rewrites the address to one without it, so the message goes with it
  // rather than standing over a form nobody has submitted yet.
  const [refused, setRefused] = useState(phoneError);

  function choose(event: MouseEvent<HTMLAnchorElement>, wanted: boolean) {
    // A modified click belongs to the browser: ⌘-click opens the other tab in
    // a new window, and it has a real address to open.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    if (wanted === register) {
      return;
    }

    setRegister(wanted);
    setRefused(false);
    // The address keeps saying which tab is showing, so a reload, a share or a
    // bookmark lands on the same one and the links above stay honest.
    // `replaceState` rather than `pushState`: the two tabs are one screen, and
    // Back belongs to whatever sent the visitor here — not to the tab they
    // glanced at on the way past.
    window.history.replaceState(null, '', wanted ? registerHref : loginHref);
  }

  return (
    <>
      {/* The heading is the tab's, which is why it lives in here and not on the
          page: it is one of the three things a press changes. */}
      <h1 className="auth-head">{register ? labels.registerHead : labels.loginHead}</h1>

      {/* Chip-backed segmented control, as the design draws it. `aria-current`
          is what tells a screen reader which of the two is showing — there is
          no selected state to announce on a pair of plain links otherwise. */}
      <div className="auth-tabs" role="tablist">
        <a
          className="auth-tab"
          role="tab"
          aria-selected={!register}
          aria-current={!register || undefined}
          href={loginHref}
          onClick={(event) => choose(event, false)}
        >
          {labels.loginTab}
        </a>
        <a
          className="auth-tab"
          role="tab"
          aria-selected={register}
          aria-current={register || undefined}
          href={registerHref}
          onClick={(event) => choose(event, true)}
        >
          {labels.registerTab}
        </a>
      </div>

      {/* `phoneLabel` used to stand in here, which showed "Phone number" as the
          explanation for why a phone number was refused. */}
      {refused && <p className="auth-note warn">{labels.phoneInvalid}</p>}

      <form action={action}>
        <input type="hidden" name="lang" value={language} />
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="mode" value={register ? 'register' : 'login'} />

        <div className="auth-field" hidden={!register}>
          <label className="auth-label" htmlFor="name">
            {labels.name}
          </label>
          <input
            className="auth-input"
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            maxLength={120}
            defaultValue={name}
            placeholder={labels.namePlaceholder}
          />
        </div>

        <div className="auth-field">
          <PhoneField
            countries={countries}
            defaultCountry={defaultCountry}
            label={labels.phone}
            countryLabel={labels.country}
            invalidHint={labels.phoneInvalid}
          />
        </div>

        <p className="auth-note">{labels.otpNote}</p>

        <button className="auth-cta" type="submit">
          {register ? labels.registerCta : labels.loginCta}
        </button>
      </form>
    </>
  );
}
