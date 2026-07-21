import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { MenuTab } from '@amragrir/shared';
import { ApiError, api, type OwnerBranch, type OwnerMenuItem } from '../api';
import { formatAmd, pickLabel } from '../format';

export function Menu({ branches }: { branches: OwnerBranch[] }) {
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [items, setItems] = useState<OwnerMenuItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    if (!id) {
      return;
    }
    try {
      const page = await api.menu(id);
      setItems(page.items);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the menu');
    }
  }, []);

  useEffect(() => {
    void load(branchId);
  }, [branchId, load]);

  const act = async (id: string, action: () => Promise<unknown>): Promise<void> => {
    setBusyId(id);
    setError(null);
    try {
      await action();
      await load(branchId);
    } catch (err) {
      // The delete-vs-ordered rule surfaces here as a 409 telling the owner to
      // mark the dish unavailable instead — worth showing verbatim.
      setError(err instanceof ApiError ? err.message : 'Could not save');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section>
      <div className="row" style={{ marginBottom: 12 }}>
        <label htmlFor="branch" className="muted">
          Branch
        </label>
        <select id="branch" value={branchId} onChange={(event) => setBranchId(event.target.value)}>
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.restaurantName} — {branch.name ?? branch.city}
            </option>
          ))}
        </select>
      </div>

      {error !== null && <p className="error">{error}</p>}

      <NewDish branchId={branchId} onCreated={() => void load(branchId)} />

      {items.map((item) => (
        <article key={item.id} className="card">
          <div className="row spread">
            <div>
              <div className="strong">{pickLabel(item.nameI18n)}</div>
              <div className="faint">
                {item.menuTab}
                {item.prepMin !== null && ` · ${item.prepMin} min`}
                {item.dietaryTags.length > 0 && ` · ${item.dietaryTags.join(', ')}`}
              </div>
            </div>
            <div className="row">
              <PriceField
                item={item}
                disabled={busyId === item.id}
                onSave={(priceAmd) => act(item.id, () => api.updateMenuItem(item.id, { priceAmd }))}
              />
              <button
                className="small"
                disabled={busyId === item.id}
                onClick={() =>
                  void act(item.id, () =>
                    api.updateMenuItem(item.id, { isAvailable: !item.isAvailable }),
                  )
                }
              >
                {item.isAvailable ? 'Mark sold out' : 'Back in stock'}
              </button>
              <button
                className="small"
                disabled={busyId === item.id}
                onClick={() => void act(item.id, () => api.deleteMenuItem(item.id))}
              >
                Delete
              </button>
            </div>
          </div>
          {!item.isAvailable && <p className="faint">Hidden from the app</p>}
        </article>
      ))}
    </section>
  );
}

/** Price is edited in place: changing one number should not be a form. */
function PriceField({
  item,
  disabled,
  onSave,
}: {
  item: OwnerMenuItem;
  disabled: boolean;
  onSave: (priceAmd: number) => void;
}) {
  const [value, setValue] = useState(String(item.priceAmd));

  useEffect(() => {
    setValue(String(item.priceAmd));
  }, [item.priceAmd]);

  const dirty = value !== String(item.priceAmd);
  const parsed = Number(value);
  const valid = Number.isInteger(parsed) && parsed >= 0;

  return (
    <span className="row">
      <input
        inputMode="numeric"
        value={value}
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
        aria-label={`Price of ${pickLabel(item.nameI18n)} in dram`}
        style={{ width: 110, minHeight: 34 }}
      />
      {dirty ? (
        <button className="primary small" disabled={disabled || !valid} onClick={() => onSave(parsed)}>
          Save
        </button>
      ) : (
        <span className="faint">{formatAmd(item.priceAmd)}</span>
      )}
    </span>
  );
}

/**
 * Only the Armenian name is required, matching the API — `hy` is the fallback
 * every other language resolves to, so a dish without it would be nameless.
 */
function NewDish({ branchId, onCreated }: { branchId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [hy, setHy] = useState('');
  const [ru, setRu] = useState('');
  const [en, setEn] = useState('');
  const [price, setPrice] = useState('');
  const [tab, setTab] = useState<MenuTab>(MenuTab.Mains);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button className="primary" onClick={() => setOpen(true)} style={{ marginBottom: 12 }}>
        Add a dish
      </button>
    );
  }

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.createMenuItem({
        branchId,
        menuTab: tab,
        // Blank translations are dropped server-side; sending them anyway
        // would store empty strings that beat the `hy` fallback.
        nameI18n: { hy, ...(ru ? { ru } : {}), ...(en ? { en } : {}) },
        priceAmd: Number(price),
      });
      setOpen(false);
      setHy('');
      setRu('');
      setEn('');
      setPrice('');
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the dish');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={submit}>
      <div className="row">
        <input value={hy} onChange={(e) => setHy(e.target.value)} placeholder="Name (հայերեն) *" aria-label="Name in Armenian" />
        <input value={ru} onChange={(e) => setRu(e.target.value)} placeholder="Название (ru)" aria-label="Name in Russian" />
        <input value={en} onChange={(e) => setEn(e.target.value)} placeholder="Name (en)" aria-label="Name in English" />
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <input
          inputMode="numeric"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Price in ֏"
          aria-label="Price in dram"
          style={{ width: 140 }}
        />
        <select value={tab} onChange={(e) => setTab(e.target.value as MenuTab)} aria-label="Menu tab">
          {Object.values(MenuTab).map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <button className="primary" disabled={busy || hy.trim() === '' || price === ''}>
          Create
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
      </div>
      {error !== null && <p className="error">{error}</p>}
    </form>
  );
}
