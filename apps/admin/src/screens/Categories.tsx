import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CATEGORY_KEY_PATTERN, Language } from '@amragrir/shared';
import { api, errorText, type StaffCategory } from '../api';
import { useLanguage } from '../i18n';
import { pickLabel } from '../format';
import {
  Badge,
  Banner,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  PageHeader,
  Skeleton,
  Switch,
  TextInput,
  Tooltip,
  useToast,
} from '../ui';

/**
 * The platform's category vocabulary — the chips every guest browses by.
 *
 * Only `super_admin` reaches this screen, and the sidebar does not draw it for
 * anybody else. That is the point of the feature rather than caution for its
 * own sake: this list is what every restaurant on the platform is indexed by,
 * and a second spelling of "Pizza" added in good faith splits a chip's traffic
 * in two with nothing in the product to report that it happened.
 *
 * What a restaurant does instead is name its own menu headings and point them
 * at rows from this table — `SectionsDialog`, on the Menu screen.
 */
export function Categories() {
  const { language, t } = useLanguage();
  const [items, setItems] = useState<StaffCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const page = await api.adminCategories();
      setItems(page.items);
      setError(null);
    } catch (err) {
      setItems([]);
      setError(errorText(t, err, 'errorLoadCategories'));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (id: string, action: () => Promise<unknown>): Promise<void> => {
    setBusyId(id);
    try {
      await action();
      await load();
    } catch (err) {
      // The refusals carry counts — "in use by 14 dishes and 3 sections" — and
      // are the whole answer, so they are shown as they came.
      toast.error(errorText(t, err, 'errorSave'));
    } finally {
      setBusyId(null);
    }
  };

  const all = items ?? [];

  return (
    <section>
      <PageHeader title={t('categoriesTitle')} description={t('categoriesDesc')} />

      {error !== null && <Banner>{error}</Banner>}

      <div className="stack">
        <NewCategory nextOrder={all.length} onCreated={load} />

        {items === null ? (
          <Skeleton count={5} height={56} />
        ) : all.length === 0 ? (
          <EmptyState
            icon="categories"
            title={t('categoriesEmptyTitle')}
            description={t('categoriesEmptyDesc')}
          />
        ) : (
          <Card className="card--flush table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('categoriesColName')}</th>
                  <th>{t('categoriesColKey')}</th>
                  <th>{t('categoriesColUsage')}</th>
                  <th>{t('categoriesColActive')}</th>
                  <th className="table__actions" />
                </tr>
              </thead>
              <tbody>
                {all.map((category) => (
                  <tr key={category.id} data-unavailable={!category.isActive || undefined}>
                    <td>
                      <NameCell
                        category={category}
                        language={language}
                        disabled={busyId === category.id}
                        onSave={(nameI18n, icon) =>
                          void act(category.id, () =>
                            api.updateCategory(category.id, { nameI18n, icon }),
                          )
                        }
                      />
                    </td>
                    <td>
                      {/* Fixed at creation and shown as code, because it is
                          one: it travels in `?category=`, in the deep links
                          both clients build, and in the placeholder filenames
                          the seed writes. Renaming it would break all three
                          while the chip on screen looked fine. */}
                      <code className="faint">{category.key}</code>
                    </td>
                    <td>
                      <span className="row row--tight">
                        <Badge>{t.plural('categoriesDishCount', category.itemCount)}</Badge>
                        <Badge>{t.plural('categoriesSectionCount', category.sectionCount)}</Badge>
                      </span>
                    </td>
                    <td>
                      {/* Retirement, not deletion. The chip leaves the rail and
                          the filter; every dish filed under it keeps its row,
                          and putting it back is this same switch. */}
                      <Tooltip
                        label={
                          category.isActive
                            ? t('categoriesActiveOnTip')
                            : t('categoriesActiveOffTip')
                        }
                      >
                        <span className="row row--tight">
                          <Switch
                            checked={category.isActive}
                            disabled={busyId === category.id}
                            ariaLabel={t('categoriesActiveSwitchLabel', {
                              category: pickLabel(category.nameI18n, language),
                            })}
                            onCheckedChange={(isActive) =>
                              void act(category.id, () =>
                                api.updateCategory(category.id, { isActive }),
                              )
                            }
                          />
                          <span className="faint">
                            {category.isActive
                              ? t('categoriesActiveYes')
                              : t('categoriesActiveNo')}
                          </span>
                        </span>
                      </Tooltip>
                    </td>
                    <td className="table__actions">
                      <ConfirmDialog
                        title={t('categoriesDeleteTitle', {
                          category: pickLabel(category.nameI18n, language),
                        })}
                        description={t('categoriesDeleteDesc')}
                        confirmLabel={t('categoriesDeleteConfirm')}
                        busy={busyId === category.id}
                        onConfirm={() =>
                          void act(category.id, () => api.deleteCategory(category.id))
                        }
                        trigger={
                          <IconButton
                            icon="trash"
                            label={t('categoriesDeleteLabel', {
                              category: pickLabel(category.nameI18n, language),
                            })}
                            // Offered only while nothing points at it. The API
                            // refuses the rest and says to retire instead; not
                            // offering it is how somebody learns that without
                            // an error message.
                            disabled={
                              busyId === category.id ||
                              category.itemCount > 0 ||
                              category.sectionCount > 0
                            }
                          />
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </section>
  );
}

/** The emoji and the name, edited in place. The name is written in whichever
 *  language the panel is set to, and the other two are carried through — the
 *  same rule the menu headings follow. */
function NameCell({
  category,
  language,
  disabled,
  onSave,
}: {
  category: StaffCategory;
  language: Language;
  disabled: boolean;
  onSave: (nameI18n: Record<string, string>, icon: string | null) => void;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState(() => pickLabel(category.nameI18n, language));
  const [icon, setIcon] = useState(category.icon ?? '');

  const commit = (): void => {
    const trimmedName = name.trim();
    const trimmedIcon = icon.trim();
    if (trimmedName === '') {
      setName(pickLabel(category.nameI18n, language));
      return;
    }
    const unchanged =
      trimmedName === pickLabel(category.nameI18n, language) &&
      trimmedIcon === (category.icon ?? '');
    if (unchanged) {
      return;
    }
    onSave(
      { ...category.nameI18n, [language]: trimmedName },
      trimmedIcon === '' ? null : trimmedIcon,
    );
  };

  return (
    <span className="row row--tight">
      <TextInput
        className="input--emoji"
        value={icon}
        onChange={(event) => setIcon(event.target.value)}
        onBlur={commit}
        disabled={disabled}
        aria-label={t('categoriesIconLabel')}
      />
      <TextInput
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={commit}
        disabled={disabled}
        aria-label={t('categoriesNameLabel')}
      />
    </span>
  );
}

/**
 * Adding a category.
 *
 * The key is typed once and never again, so the field checks it here against
 * the same pattern the API does — lowercase latin, digits and underscores. A
 * refusal after somebody has filled in three names is a worse way to learn the
 * rule than a field that says it.
 */
function NewCategory({ nextOrder, onCreated }: { nextOrder: number; onCreated: () => void }) {
  const { t } = useLanguage();
  const [key, setKey] = useState('');
  const [icon, setIcon] = useState('');
  const [hy, setHy] = useState('');
  const [ru, setRu] = useState('');
  const [en, setEn] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const keyValid = CATEGORY_KEY_PATTERN.test(key);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    try {
      const nameI18n: Record<string, string> = { [Language.Hy]: hy.trim() };
      if (ru.trim() !== '') {
        nameI18n[Language.Ru] = ru.trim();
      }
      if (en.trim() !== '') {
        nameI18n[Language.En] = en.trim();
      }
      await api.createCategory({
        key,
        nameI18n,
        ...(icon.trim() === '' ? {} : { icon: icon.trim() }),
        sortOrder: nextOrder,
      });
      toast.success(t('categoriesAdded', { category: hy.trim() }));
      setKey('');
      setIcon('');
      setHy('');
      setRu('');
      setEn('');
      onCreated();
    } catch (err) {
      toast.error(errorText(t, err, 'errorSave'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <form onSubmit={submit}>
        <h3 className="form-card__title">{t('categoriesNewTitle')}</h3>
        <p className="form-card__note">{t('categoriesNewNote')}</p>

        <div className="grid-2">
          <Field label={t('categoriesNewKey')} required hint={t('categoriesNewKeyHint')}>
            {(id) => (
              <TextInput
                id={id}
                value={key}
                onChange={(event) => setKey(event.target.value.toLowerCase())}
                placeholder="shawarma"
                disabled={busy}
              />
            )}
          </Field>
          <Field label={t('categoriesNewIcon')} hint={t('categoriesNewIconHint')}>
            {(id) => (
              <TextInput
                id={id}
                value={icon}
                onChange={(event) => setIcon(event.target.value)}
                placeholder="🌯"
                disabled={busy}
              />
            )}
          </Field>
        </div>

        <Field label={t('categoriesNewNameHy')} required hint={t('categoriesNewNameHyHint')}>
          {(id) => (
            <TextInput
              id={id}
              value={hy}
              onChange={(event) => setHy(event.target.value)}
              disabled={busy}
            />
          )}
        </Field>

        <div className="grid-2">
          <Field label={t('categoriesNewNameRu')}>
            {(id) => (
              <TextInput
                id={id}
                value={ru}
                onChange={(event) => setRu(event.target.value)}
                disabled={busy}
              />
            )}
          </Field>
          <Field label={t('categoriesNewNameEn')}>
            {(id) => (
              <TextInput
                id={id}
                value={en}
                onChange={(event) => setEn(event.target.value)}
                disabled={busy}
              />
            )}
          </Field>
        </div>

        <div className="row row--end form-card__foot">
          <Button
            type="submit"
            variant="primary"
            icon="plus"
            loading={busy}
            disabled={!keyValid || hy.trim() === ''}
          >
            {t('categoriesNewSubmit')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
