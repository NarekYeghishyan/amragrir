import { useState, type FormEvent, type ReactNode } from 'react';
import { api, errorText } from '../api';
import { useT } from '../i18n';
import {
  Button,
  Card,
  Field,
  PageHeader,
  Select,
  TextInput,
  useToast,
} from '../ui';

/** Creating restaurants and issuing promos — the two things only an admin
 *  does, and both of them write something a customer will see. */
export function Platform() {
  const t = useT();
  return (
    <section>
      <PageHeader title={t('platformTitle')} description={t('platformDesc')} />
      <div className="stack">
        <NewRestaurant />
        <NewPromo />
      </div>
    </section>
  );
}

/** A card that holds one form, with its own heading and consequence note. */
function FormCard({
  title,
  note,
  children,
  onSubmit,
}: {
  title: string;
  note: string;
  children: ReactNode;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <Card>
      <form onSubmit={onSubmit}>
        <h3 className="form-card__title">{title}</h3>
        <p className="form-card__note">{note}</p>
        {children}
      </form>
    </Card>
  );
}

function NewRestaurant() {
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [busy, setBusy] = useState(false);
  const t = useT();
  const toast = useToast();

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    try {
      const created = await api.createRestaurant({
        slug,
        name,
        adminEmail: adminEmail || undefined,
        cuisine: cuisine || undefined,
      });
      toast.success(
        adminEmail
          ? t('newRestaurantWithAdmin', { slug: created.slug, email: adminEmail })
          : t('newRestaurantNoAdmin', { slug: created.slug }),
      );
      setSlug('');
      setName('');
      setAdminEmail('');
      setCuisine('');
    } catch (err) {
      toast.error(errorText(t, err, 'errorCreateRestaurant'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormCard title={t('newRestaurantTitle')} note={t('newRestaurantNote')} onSubmit={submit}>
      <div className="grid-2">
        <Field label={t('newRestaurantName')} required>
          {(id) => (
            <TextInput
              id={id}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('newRestaurantNamePlaceholder')}
            />
          )}
        </Field>
        <Field label={t('newRestaurantSlug')} required hint={t('newRestaurantSlugHint')}>
          {(id) => (
            <TextInput
              id={id}
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              placeholder={t('newRestaurantSlugPlaceholder')}
            />
          )}
        </Field>
        <Field label={t('newRestaurantCuisine')}>
          {(id) => (
            <TextInput
              id={id}
              value={cuisine}
              onChange={(event) => setCuisine(event.target.value)}
              placeholder={t('newRestaurantCuisinePlaceholder')}
            />
          )}
        </Field>
        <Field label={t('newRestaurantAdminEmail')} hint={t('newRestaurantAdminHint')}>
          {(id) => (
            <TextInput
              id={id}
              type="email"
              value={adminEmail}
              onChange={(event) => setAdminEmail(event.target.value)}
              placeholder={t('newRestaurantAdminPlaceholder')}
            />
          )}
        </Field>
      </div>

      <div className="row row--end form-card__foot">
        <Button type="submit" variant="primary" loading={busy} disabled={!name || !slug}>
          {t('newRestaurantSubmit')}
        </Button>
      </div>
    </FormCard>
  );
}

function NewPromo() {
  const [code, setCode] = useState('');
  const [kind, setKind] = useState<'pct' | 'amd'>('pct');
  const [value, setValue] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [busy, setBusy] = useState(false);
  const t = useT();
  const toast = useToast();

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    try {
      const issued = await api.issuePromo({
        code: code.toUpperCase(),
        // Exactly one of the two, which is what the API demands.
        ...(kind === 'pct' ? { discountPct: Number(value) } : { discountAmd: Number(value) }),
        validUntil: validUntil ? new Date(validUntil).toISOString() : undefined,
      });
      toast.success(t.plural('promoIssued', issued.issued, { code: issued.code }));
      setCode('');
      setValue('');
    } catch (err) {
      toast.error(errorText(t, err, 'errorIssuePromo'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormCard title={t('newPromoTitle')} note={t('newPromoNote')} onSubmit={submit}>
      <div className="grid-2">
        <Field label={t('newPromoCode')} required>
          {(id) => (
            <TextInput
              id={id}
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder={t('newPromoCodePlaceholder')}
            />
          )}
        </Field>
        <Field label={t('newPromoDiscount')}>
          {(id) => (
            <Select
              id={id}
              value={kind}
              onValueChange={setKind}
              options={[
                { value: 'pct' as const, label: t('newPromoPercent') },
                { value: 'amd' as const, label: t('newPromoDram') },
              ]}
            />
          )}
        </Field>
        <Field label={kind === 'pct' ? t('newPromoPercentLabel') : t('newPromoDramLabel')} required>
          {(id) => (
            <TextInput
              id={id}
              inputMode="numeric"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={kind === 'pct' ? '10' : '1000'}
            />
          )}
        </Field>
        <Field label={t('newPromoValidUntil')} hint={t('newPromoValidUntilHint')}>
          {(id) => (
            <TextInput
              id={id}
              type="date"
              value={validUntil}
              onChange={(event) => setValidUntil(event.target.value)}
            />
          )}
        </Field>
      </div>

      <div className="row row--end form-card__foot">
        <Button
          type="submit"
          variant="primary"
          loading={busy}
          disabled={code.length < 3 || value === ''}
        >
          {t('newPromoSubmit')}
        </Button>
      </div>
    </FormCard>
  );
}
