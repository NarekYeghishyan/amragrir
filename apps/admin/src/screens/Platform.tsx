import { useState, type FormEvent } from 'react';
import { ApiError, api } from '../api';

/** Creating restaurants and issuing promos — the two things only an admin
 *  does, and both of them write something a customer will see. */
export function Platform() {
  return (
    <section>
      <NewRestaurant />
      <NewPromo />
    </section>
  );
}

function NewRestaurant() {
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const created = await api.createRestaurant({
        slug,
        name,
        ownerId,
        cuisine: cuisine || undefined,
      });
      setResult(`Created ${created.slug}`);
      setSlug('');
      setName('');
      setOwnerId('');
      setCuisine('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the restaurant');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2 style={{ fontSize: 17, marginTop: 0 }}>New restaurant</h2>
      <p className="faint" style={{ marginTop: 0 }}>
        The slug becomes a public URL on the website, so it cannot be changed casually.
      </p>
      <div className="row">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Restaurant name" />
        <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="url-slug" aria-label="Slug" />
        <input value={cuisine} onChange={(e) => setCuisine(e.target.value)} placeholder="Cuisine" aria-label="Cuisine" />
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <input
          value={ownerId}
          onChange={(e) => setOwnerId(e.target.value)}
          placeholder="Owner user id"
          aria-label="Owner user id"
          style={{ minWidth: 320 }}
        />
        <button className="primary" disabled={busy || !name || !slug || !ownerId}>
          Create
        </button>
      </div>
      <p className="faint">The owner must already have the owner role — promote them on the Users tab first.</p>
      {result !== null && <p className="live">{result}</p>}
      {error !== null && <p className="error">{error}</p>}
    </form>
  );
}

function NewPromo() {
  const [code, setCode] = useState('');
  const [kind, setKind] = useState<'pct' | 'amd'>('pct');
  const [value, setValue] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const issued = await api.issuePromo({
        code: code.toUpperCase(),
        // Exactly one of the two, which is what the API demands.
        ...(kind === 'pct' ? { discountPct: Number(value) } : { discountAmd: Number(value) }),
        validUntil: validUntil ? new Date(validUntil).toISOString() : undefined,
      });
      setResult(`Issued ${issued.code} to ${issued.issued} account(s)`);
      setCode('');
      setValue('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not issue the promo');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2 style={{ fontSize: 17, marginTop: 0 }}>Issue a promo</h2>
      <p className="faint" style={{ marginTop: 0 }}>
        Goes to every verified customer. Re-issuing the same code tops up accounts that joined
        since, and skips those who already have it.
      </p>
      <div className="row">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="SUMMER"
          aria-label="Promo code"
        />
        <select value={kind} onChange={(e) => setKind(e.target.value as 'pct' | 'amd')} aria-label="Discount kind">
          <option value="pct">percent off</option>
          <option value="amd">dram off</option>
        </select>
        <input
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={kind === 'pct' ? '10' : '1000'}
          aria-label="Discount value"
          style={{ width: 120 }}
        />
        <input
          type="date"
          value={validUntil}
          onChange={(e) => setValidUntil(e.target.value)}
          aria-label="Valid until"
        />
        <button className="primary" disabled={busy || code.length < 3 || value === ''}>
          Issue
        </button>
      </div>
      {result !== null && <p className="live">{result}</p>}
      {error !== null && <p className="error">{error}</p>}
    </form>
  );
}
