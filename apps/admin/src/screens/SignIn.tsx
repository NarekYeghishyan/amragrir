import { useState, type FormEvent, type ReactNode } from 'react';
import { api, errorText, tokens } from '../api';
import { useLanguage, useT } from '../i18n';
import { LANGUAGES, LANGUAGE_LABEL_KEYS } from '../language';
import { navigate } from '../router';
import { Banner, Button, Field, TextInput, cx } from '../ui';

/**
 * Back-office sign-in: email and a password.
 *
 * Not the customer OTP flow. Staff are separate accounts (see
 * docs/ROLES_AND_PERMISSIONS.md) and there is no sign-up — an account exists
 * only because somebody who already had one sent an invitation, which is what
 * makes "a customer cannot become staff" true rather than merely enforced.
 *
 * The three states below are all reachable from a link in an email, so the
 * screen reads `?token=` on load rather than asking anyone to paste it.
 */
export type Mode = 'signin' | 'forgot' | 'accept' | 'reset';

/**
 * Reads the mode out of the URL the email link landed on.
 *
 * A path without a token falls back to the sign-in form rather than showing a
 * "set your password" screen that cannot possibly work.
 */
export function modeFromUrl(pathname: string, search: string): { mode: Mode; token: string } {
  const token = new URLSearchParams(search).get('token');
  if (!token) {
    return { mode: 'signin', token: '' };
  }
  if (pathname.endsWith('/accept-invite')) {
    return { mode: 'accept', token };
  }
  if (pathname.endsWith('/reset-password')) {
    return { mode: 'reset', token };
  }
  return { mode: 'signin', token: '' };
}

export function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const t = useT();
  const [{ mode, token }, setState] = useState(() =>
    modeFromUrl(window.location.pathname, window.location.search),
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = (event: FormEvent, action: () => Promise<void>): void => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    void action()
      .catch((err: unknown) => {
        setError(errorText(t, err, 'errorGeneric'));
      })
      .finally(() => setBusy(false));
  };

  /**
   * Clears the token out of the address bar once it has been spent, so a reload
   * does not retry a credential that is already used up.
   *
   * Through the router rather than `history.replaceState` directly: the shell
   * renders from the address now, and a change it is not told about is a URL
   * and a screen that disagree. `/` is not a screen either — it is the route
   * that means nothing, which the shell resolves into the first screen this
   * account can open, and that is exactly where somebody who has just accepted
   * an invitation should land.
   */
  const landed = (): void => {
    navigate('/', { replace: true });
    onSignedIn();
  };

  const feedback = (
    <>
      {notice !== null && <Banner tone="good">{notice}</Banner>}
      {error !== null && <Banner>{error}</Banner>}
    </>
  );

  if (mode === 'accept' || mode === 'reset') {
    const accepting = mode === 'accept';
    return (
      <Frame
        title={accepting ? t('acceptTitle') : t('resetTitle')}
        description={t('passwordDesc')}
      >
        <form
          className="signin__form"
          onSubmit={(event) =>
            run(event, async () => {
              if (accepting) {
                const result = await api.acceptInvite(token, password, name || undefined);
                tokens.set(result.accessToken, result.refreshToken);
                landed();
                return;
              }
              await api.resetPassword(token, password);
              setState({ mode: 'signin', token: '' });
              setNotice(t('resetDone'));
            })
          }
        >
          {feedback}
          {accepting && (
            <Field label={t('acceptName')}>
              {(id) => (
                <TextInput
                  id={id}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoFocus
                />
              )}
            </Field>
          )}
          <Field label={t('newPassword')} required>
            {(id) => (
              <TextInput
                id={id}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                autoFocus={!accepting}
              />
            )}
          </Field>
          <Button
            type="submit"
            variant="primary"
            className="btn--block"
            loading={busy}
            disabled={password.length < 12}
          >
            {accepting ? t('acceptSubmit') : t('resetSubmit')}
          </Button>
        </form>
      </Frame>
    );
  }

  if (mode === 'forgot') {
    return (
      <Frame title={t('forgotTitle')} description={t('forgotDesc')}>
        <form
          className="signin__form"
          onSubmit={(event) =>
            run(event, async () => {
              await api.forgotPassword(email);
              // Same message whether or not the address belongs to anyone: this
              // screen must not be a way to find out who works here.
              setNotice(t('forgotSent'));
            })
          }
        >
          {feedback}
          <Field label={t('signInEmail')} required>
            {(id) => (
              <TextInput
                id={id}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t('signInEmailPlaceholder')}
                autoComplete="username"
                autoFocus
              />
            )}
          </Field>
          <Button
            type="submit"
            variant="primary"
            className="btn--block"
            loading={busy}
            disabled={!email.includes('@')}
          >
            {t('forgotSubmit')}
          </Button>
        </form>
        <p className="signin__foot">
          <button
            type="button"
            className="link-btn"
            onClick={() => setState({ mode: 'signin', token: '' })}
            disabled={busy}
          >
            {t('forgotBack')}
          </button>
        </p>
      </Frame>
    );
  }

  return (
    <Frame title={t('signInTitle')} description={t('signInDesc')}>
      <form
        className="signin__form"
        onSubmit={(event) =>
          run(event, async () => {
            const result = await api.login(email, password);
            tokens.set(result.accessToken, result.refreshToken);
            onSignedIn();
          })
        }
      >
        {feedback}
        <Field label={t('signInEmail')} required>
          {(id) => (
            <TextInput
              id={id}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t('signInEmailPlaceholder')}
              autoComplete="username"
              autoFocus
            />
          )}
        </Field>
        <Field label={t('signInPassword')} required>
          {(id) => (
            <TextInput
              id={id}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          )}
        </Field>
        <Button
          type="submit"
          variant="primary"
          className="btn--block"
          loading={busy}
          disabled={!email.includes('@') || password === ''}
        >
          {t('signInSubmit')}
        </Button>
      </form>
      <p className="signin__foot">
        <button
          type="button"
          className="link-btn"
          onClick={() => setState({ mode: 'forgot', token: '' })}
          disabled={busy}
        >
          {t('signInForgot')}
        </button>
      </p>
    </Frame>
  );
}

/** One card, centred, for all four states — so an emailed link lands on
 *  something that looks like the panel rather than a bare form. */
function Frame({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div className="signin">
      <div className="signin__card">
        <div className="signin__brand">
          <span className="brand__mark" aria-hidden="true">
            A
          </span>
          <span>
            <span className="brand__name">{t('brand')}</span>
            <span className="brand__role">{t('shellBackOffice')}</span>
          </span>
        </div>
        <h1 className="signin__title">{title}</h1>
        <p className="signin__desc">{description}</p>
        {children}

        {/* Three visible buttons rather than the menu the shell uses: the
            account menu is behind a sign-in, and somebody who cannot read this
            screen has no way to reach it. Endonyms, so each option is legible
            to the person who needs it whatever the panel is currently set to. */}
        <div className="signin__langs" role="group" aria-label={t('accountLanguage')}>
          {LANGUAGES.map((option) => (
            <button
              key={option}
              type="button"
              lang={option}
              className={cx('signin__lang', option === language && 'signin__lang--on')}
              aria-pressed={option === language}
              onClick={() => setLanguage(option)}
            >
              {t(LANGUAGE_LABEL_KEYS[option])}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
