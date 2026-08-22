import { useState, type FormEvent } from 'react';
import { Language } from '@amragrir/shared';
import {
  api,
  errorText,
  type CategoryOption,
  type StaffMenuSection,
} from './api';
import { useLanguage } from './i18n';
import { pickLabel } from './format';
import {
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  DialogBody,
  DialogClose,
  DialogFooter,
  Field,
  IconButton,
  Select,
  TextInput,
  useToast,
} from './ui';

/**
 * The shape of a branch's menu — its headings, their order, and what each one
 * maps onto in the platform's vocabulary.
 *
 * A dialog rather than a screen of its own because it is the menu's own
 * structure: whoever opens it is already looking at the dishes it arranges, and
 * a second sidebar entry would separate the two decisions that are always made
 * together ("add a Сеты shelf" / "put the sets on it").
 *
 * **The category select is the important control here, not the name.** A
 * heading mapped to one gives every dish under it a category for free, and a
 * dish with no category is invisible to every filter in the app — so the field
 * says what it will do rather than just naming itself.
 */
export function SectionsDialog({
  branchId,
  sections,
  categories,
  open,
  onOpenChange,
  onChanged,
}: {
  branchId: string;
  sections: StaffMenuSection[];
  categories: CategoryOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The menu behind this dialog is stale the moment anything here saves —
   *  a dish's Section column names a heading that may have just been renamed. */
  onChanged: () => void;
}) {
  const { language, t } = useLanguage();

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('sectionsTitle')}
      description={t('sectionsDesc')}
    >
      <DialogBody>
        {sections.length === 0 ? (
          <p className="faint">{t('sectionsEmpty')}</p>
        ) : (
          <ul className="stack stack--tight">
            {sections.map((section, index) => (
              <SectionRow
                key={section.id}
                section={section}
                categories={categories}
                language={language}
                first={index === 0}
                last={index === sections.length - 1}
                onChanged={onChanged}
              />
            ))}
          </ul>
        )}

        <NewSection
          branchId={branchId}
          categories={categories}
          nextOrder={sections.length}
          onCreated={onChanged}
        />
      </DialogBody>

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="primary">{t('actionClose')}</Button>
        </DialogClose>
      </DialogFooter>
    </Dialog>
  );
}

/**
 * One heading: what it is called, what it maps to, where it sits, and the way
 * out.
 *
 * The order controls are two buttons rather than a drag handle — a menu has a
 * handful of headings, and "move this one up" is one keystroke away from
 * working for somebody who cannot drag.
 */
function SectionRow({
  section,
  categories,
  language,
  first,
  last,
  onChanged,
}: {
  section: StaffMenuSection;
  categories: CategoryOption[];
  language: Language;
  first: boolean;
  last: boolean;
  onChanged: () => void;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState(() => pickLabel(section.nameI18n, language));
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const save = async (patch: Parameters<typeof api.updateMenuSection>[1]): Promise<void> => {
    setBusy(true);
    try {
      await api.updateMenuSection(section.id, patch);
      onChanged();
    } catch (err) {
      // The refusals here are worth reading verbatim: unmapping a shelf whose
      // dishes rely on it names how many would be stranded.
      toast.error(errorText(t, err, 'errorSave'));
    } finally {
      setBusy(false);
    }
  };

  const rename = (): void => {
    const trimmed = name.trim();
    if (trimmed === '' || trimmed === pickLabel(section.nameI18n, language)) {
      return;
    }
    // Only the language being edited is replaced; the other two are carried
    // through, or a rename in Russian would take the Armenian name off a
    // heading every guest with an Armenian phone reads.
    void save({ nameI18n: { ...section.nameI18n, [language]: trimmed } });
  };

  return (
    <li className="section-row">
      <div className="section-row__main">
        <TextInput
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={rename}
          disabled={busy}
          aria-label={t('sectionsNameLabel')}
        />
        <Select
          value={section.categoryId ?? ''}
          onValueChange={(categoryId) =>
            void save({ categoryId: categoryId === '' ? null : categoryId })
          }
          disabled={busy}
          ariaLabel={t('sectionsCategoryLabel')}
          options={[
            { value: '', label: t('sectionsCategoryNone') },
            ...categories.map((entry) => ({
              value: entry.id,
              label: entry.icon ? `${entry.icon} ${entry.name}` : entry.name,
            })),
          ]}
        />
      </div>

      <div className="row row--tight row--end">
        <Badge>{t.plural('sectionsDishCount', section.itemCount)}</Badge>
        <IconButton
          icon="chevronUp"
          label={t('sectionsMoveUp')}
          disabled={busy || first}
          onClick={() => void save({ sortOrder: Math.max(section.sortOrder - 1, 0) })}
        />
        <IconButton
          icon="chevronDown"
          label={t('sectionsMoveDown')}
          disabled={busy || last}
          onClick={() => void save({ sortOrder: section.sortOrder + 1 })}
        />
        <ConfirmDialog
          title={t('sectionsDeleteTitle', { section: pickLabel(section.nameI18n, language) })}
          description={t('sectionsDeleteDesc')}
          confirmLabel={t('sectionsDeleteConfirm')}
          busy={busy}
          onConfirm={async () => {
            setBusy(true);
            try {
              await api.deleteMenuSection(section.id);
              onChanged();
            } catch (err) {
              // 409 with the count when dishes are still on the shelf. Shown as
              // it came: "move or remove them first" is the whole answer.
              toast.error(errorText(t, err, 'errorSave'));
            } finally {
              setBusy(false);
            }
          }}
          trigger={
            <IconButton
              icon="trash"
              label={t('sectionsDeleteLabel', {
                section: pickLabel(section.nameI18n, language),
              })}
              // Offered only on an empty shelf. The API refuses the rest anyway;
              // this saves somebody discovering that from an error.
              disabled={busy || section.itemCount > 0}
            />
          }
        />
      </div>
    </li>
  );
}

/** Adding one. Armenian only, like every other name field that creates
 *  something — it is the fallback the app resolves to, and the other two
 *  languages are a rename away in the row above. */
function NewSection({
  branchId,
  categories,
  nextOrder,
  onCreated,
}: {
  branchId: string;
  categories: CategoryOption[];
  nextOrder: number;
  onCreated: () => void;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    try {
      await api.createMenuSection({
        branchId,
        nameI18n: { [Language.Hy]: name.trim() },
        ...(categoryId === '' ? {} : { categoryId }),
        sortOrder: nextOrder,
      });
      setName('');
      setCategoryId('');
      onCreated();
    } catch (err) {
      toast.error(errorText(t, err, 'errorSave'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="section-new" onSubmit={submit}>
      <div className="grid-2">
        <Field label={t('sectionsNewName')} required hint={t('sectionsNewNameHint')}>
          {(id) => (
            <TextInput
              id={id}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('sectionsNewNamePlaceholder')}
              disabled={busy}
            />
          )}
        </Field>
        <Field label={t('sectionsCategoryLabel')} hint={t('sectionsCategoryHint')}>
          {(id) => (
            <Select
              id={id}
              value={categoryId}
              onValueChange={setCategoryId}
              disabled={busy}
              options={[
                { value: '', label: t('sectionsCategoryNone') },
                ...categories.map((entry) => ({
                  value: entry.id,
                  label: entry.icon ? `${entry.icon} ${entry.name}` : entry.name,
                })),
              ]}
            />
          )}
        </Field>
      </div>
      <div className="row row--end">
        <Button type="submit" icon="plus" loading={busy} disabled={name.trim() === ''}>
          {t('sectionsAdd')}
        </Button>
      </div>
    </form>
  );
}
