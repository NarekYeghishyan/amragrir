import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DEFAULT_PHONE_COUNTRY } from '@amragrir/shared';
import { parseLanguage, t } from '@/lib/language';
import { ORDER_ROBOTS, checkoutPath, signinPath } from '@/lib/site';
import { countryOptions } from '@/lib/phone';
import { PhoneField } from '@/components/PhoneField';
import { confirmCode, requestCode } from '../actions';

export const metadata: Metadata = { title: 'Sign in', robots: ORDER_ROBOTS };
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ lang: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Phone plus OTP — the only way a customer signs in (AI_CONTEXT.md).
 *
 * Two steps in one route, chosen by `?step=`, because the second step needs
 * the phone number from the first and a query string carries it across a plain
 * form POST without any client state. The guest account the visitor already
 * has is upgraded rather than replaced; see `confirmCode`.
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
  const onCodeStep = sp.step === 'code';
  const error = typeof sp.error === 'string' ? sp.error : undefined;

  return (
    <div className="signin">
      <h1>{label('signIn')}</h1>
      <p className="lede">{label('signInHint')}</p>

      {/* `phoneLabel` used to stand in here, which showed "Phone number" as the
          explanation for why a phone number was refused. */}
      {error === 'phone' && <p className="notice warn">{label('phoneInvalid')}</p>}
      {error === 'code' && <p className="notice warn">{label('codeWrong')}</p>}

      {onCodeStep ? (
        <>
          <p className="notice">{label('codeHint')}</p>
          <form className="stack" action={confirmCode}>
            <input type="hidden" name="lang" value={language} />
            <input type="hidden" name="next" value={next} />
            <input type="hidden" name="phone" value={phone} />
            <label htmlFor="code">{label('codeLabel')}</label>
            <input
              id="code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
            />
            <button className="cta-action" type="submit">
              {label('verifyCode')}
            </button>
          </form>
          <a className="panel-back" href={signinPath(language, next)}>
            ← {label('changeNumber')}
          </a>
        </>
      ) : (
        <form className="stack" action={requestCode}>
          <input type="hidden" name="lang" value={language} />
          <input type="hidden" name="next" value={next} />
          <PhoneField
            countries={countryOptions(language)}
            defaultCountry={DEFAULT_PHONE_COUNTRY.code}
            label={label('phoneLabel')}
            countryLabel={label('countryLabel')}
            invalidHint={label('phoneInvalid')}
          />
          <button className="cta-action" type="submit">
            {label('sendCode')}
          </button>
        </form>
      )}
    </div>
  );
}
