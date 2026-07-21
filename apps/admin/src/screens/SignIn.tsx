import { useState, type FormEvent } from 'react';
import { Role } from '@amragrir/shared';
import { ApiError, api, tokens } from '../api';

/**
 * Owner sign-in — the same OTP flow the customer app uses; the panel is just
 * another client. The role check below is a courtesy: every owner endpoint is
 * guarded server-side regardless of what this screen decides.
 */
export function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (event: FormEvent, action: () => Promise<void>): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  if (!sent) {
    return (
      <form
        className="signin"
        onSubmit={(event) =>
          run(event, async () => {
            await api.sendCode(phone);
            setSent(true);
          })
        }
      >
        <h1>Amragrir back office</h1>
        <input
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="+374 99 123456"
          aria-label="Phone number"
          autoFocus
        />
        <button className="primary" disabled={busy || phone.length < 6}>
          Send code
        </button>
        {error !== null && <p className="error">{error}</p>}
      </form>
    );
  }

  return (
    <form
      className="signin"
      onSubmit={(event) =>
        run(event, async () => {
          const result = await api.verifyCode(phone, code);
          if (result.user.role !== Role.Owner && result.user.role !== Role.Admin) {
            // Signing in worked — this account simply is not staff. Say so
            // instead of dropping them into a panel where everything 403s.
            tokens.clear();
            throw new ApiError(403, 'FORBIDDEN', 'This account cannot manage a restaurant');
          }
          tokens.set(result.accessToken, result.refreshToken);
          onSignedIn();
        })
      }
    >
      <h1>Enter the code</h1>
      <p className="muted">Sent to {phone}. In development it is printed to the API log.</p>
      <input
        inputMode="numeric"
        value={code}
        onChange={(event) => setCode(event.target.value)}
        placeholder="1234"
        aria-label="Verification code"
        autoFocus
      />
      <button className="primary" disabled={busy || code.length < 4}>
        Sign in
      </button>
      <button type="button" onClick={() => setSent(false)} disabled={busy}>
        Change number
      </button>
      {error !== null && <p className="error">{error}</p>}
    </form>
  );
}
