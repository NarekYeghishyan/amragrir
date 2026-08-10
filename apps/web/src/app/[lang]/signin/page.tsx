import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DEFAULT_PHONE_COUNTRY, countryOptions } from '@amragrir/shared';
import { parseLanguage, t } from '@/lib/language';
import { ORDER_ROBOTS, checkoutPath, signinPath } from '@/lib/site';
import { AuthPanel } from '@/components/AuthPanel';
import { confirmCode, requestCode } from '../actions';

export const metadata: Metadata = { title: 'Sign in', robots: ORDER_ROBOTS };
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ lang: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * The design's AUTH PAGE — one card, a log-in / sign-up tab pair, phone + OTP.
 *
 * **The tabs choose a field, not an endpoint.** There is one credential
 * (AI_CONTEXT.md: phone + OTP) and one API call behind both: `verify-code`
 * takes an optional name and upgrades the guest account in place. So "sign up"
 * is the same flow with the name field showing — which is exactly what the
 * design does too, where both tabs run the same `submitAuth`. Nothing here can
 * tell a returning number from a new one before the code is confirmed, and it
 * does not need to: the API decides, and reports back `isNewUser`.
 *
 * **The tabs are links, and with a client behind them they stop navigating.**
 * `?mode=register` is still the whole state: the href is real, this page
 * renders whichever tab it names, and a browser without JavaScript follows it
 * as the rest of this flow expects. But a press only decides which field shows,
 * and paying a round trip to a `force-dynamic` page for that rebuilt the card,
 * replayed its entry animation and dropped whatever was already typed into the
 * number field. `AuthPanel` makes the switch in place and rewrites the address
 * behind it, so the two paths still agree on what the URL means.
 *
 * Two steps in one route, chosen by `?step=`, because the second step needs the
 * phone number — and now the name — from the first, and a query string carries
 * both across a plain form POST without any client state. The design has no
 * second step (SCREENS.md §0 records that it should grow one); this keeps it,
 * because that is what the API does.
 */
export default async function SignInPage({ params, searchParams }: Props) {
  const [{ lang }, sp] = await Promise.all([params, searchParams]);
  const language = parseLanguage(lang);
  if (!language) {
    notFound();
  }
  const label = t(language);

  const next = typeof sp.next === 'string' ? sp.next : checkoutPath(language);
  const phone = typeof sp.phone === 'string' ? sp.phone : '';
  const name = typeof sp.name === 'string' ? sp.name : '';
  const register = sp.mode === 'register';
  const onCodeStep = sp.step === 'code';
  const error = typeof sp.error === 'string' ? sp.error : undefined;

  /** The other tab's address, keeping `next` so the return trip survives it. */
  const tabHref = (mode: 'login' | 'register') =>
    mode === 'register' ? `${signinPath(language, next)}&mode=register` : signinPath(language, next);

  return (
    // `.wrap` in the layout is already the page's `<main>`; this only centres
    // the card inside it, which is all the design's own `<main>` added.
    <div className="auth-page">
      <div className="auth-card rise">
        {onCodeStep ? (
          <>
            {/* The same heading as the step before it: confirming the code is
                the second half of the act named there, not a screen of its own,
                and the design has one card. The step is told apart by what is
                under it — the note naming the number the code went to. */}
            <h1 className="auth-head">{label(register ? 'authRegisterHead' : 'authLoginHead')}</h1>

            <p className="auth-note">
              {label('codeHint')} {phone}
            </p>

            {error === 'code' && <p className="auth-note warn">{label('codeWrong')}</p>}

            <form action={confirmCode}>
              <input type="hidden" name="lang" value={language} />
              <input type="hidden" name="next" value={next} />
              <input type="hidden" name="phone" value={phone} />
              <input type="hidden" name="name" value={name} />
              <input type="hidden" name="mode" value={register ? 'register' : 'login'} />

              <div className="auth-field">
                <label className="auth-label" htmlFor="code">
                  {label('codeLabel')}
                </label>
                <input
                  className="auth-input auth-code"
                  id="code"
                  name="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                />
              </div>

              <button className="auth-cta" type="submit">
                {label('verifyCode')}
              </button>
            </form>

            <a className="auth-alt" href={tabHref(register ? 'register' : 'login')}>
              ← {label('changeNumber')}
            </a>
          </>
        ) : (
          <AuthPanel
            language={language}
            next={next}
            initialRegister={register}
            loginHref={tabHref('login')}
            registerHref={tabHref('register')}
            name={name}
            countries={countryOptions(language)}
            defaultCountry={DEFAULT_PHONE_COUNTRY.code}
            phoneError={error === 'phone'}
            labels={{
              loginHead: label('authLoginHead'),
              registerHead: label('authRegisterHead'),
              loginTab: label('authLogin'),
              registerTab: label('authRegister'),
              loginCta: label('authLoginCta'),
              registerCta: label('authRegisterCta'),
              name: label('authName'),
              namePlaceholder: label('authNamePlaceholder'),
              phone: label('phoneLabel'),
              country: label('countryLabel'),
              phoneInvalid: label('phoneInvalid'),
              otpNote: label('authOtpNote'),
            }}
            action={requestCode}
          />
        )}

        <p className="auth-terms">{label('authTerms')}</p>
      </div>
    </div>
  );
}
