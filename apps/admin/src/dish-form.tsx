import { useState, type FormEvent } from 'react';
import {
  api,
  errorText,
  type CategoryOption,
  type StaffMenuItem,
  type StaffMenuSection,
} from './api';
import {
  dishForm,
  dishFormValid,
  dishNames,
  dishPatch,
  NO_DISH,
  type DishForm,
} from './dish';
import { PhotoField, usePhotoUpload, type PhotoUpload } from './photo';
import { useLanguage, useT } from './i18n';
import { pickLabel } from './format';
import {
  Banner,
  Button,
  Dialog,
  DialogBody,
  DialogClose,
  DialogFooter,
  Field,
  Select,
  Switch,
  TextInput,
  useToast,
} from './ui';

/**
 * The two forms a dish is written in: the one that adds it, and the one that
 * changes it afterwards.
 *
 * Out of `screens/Menu.tsx` because they are not the menu — the screen is a list
 * of dishes with a price box and a sold-out switch in each row, and these are
 * the dialogs it opens over it. The same split `menu-history.tsx` makes.
 */

/**
 * The fields of a dish, in the order somebody fills them in.
 *
 * One component for both forms rather than two that happen to match: adding a
 * dish and editing one ask for exactly the same things, and the moment they are
 * written twice is the moment a field lands in one of them only.
 */
export function DishFields({
  form,
  onChange,
  upload,
  photoHint,
  disabled,
  sections,
  categories,
}: {
  form: DishForm;
  /** Whichever fields moved — the form is one object, so a change is a patch of
   *  it rather than a setter per input. */
  onChange: (patch: Partial<DishForm>) => void;
  upload: PhotoUpload;
  /** What the photo field says under it, which is the one thing the two forms
   *  do not agree on: a dish being added has no picture yet, one being edited
   *  already has the picture this would replace. */
  photoHint: string;
  disabled: boolean;
  /** This branch's headings, in its own order. */
  sections: StaffMenuSection[];
  /** The live rail, for the override below and for naming what a section maps
   *  onto. */
  categories: CategoryOption[];
}) {
  const { language, t } = useLanguage();
  const section = sections.find((entry) => entry.id === form.sectionId) ?? null;
  const inherited = categories.find((entry) => entry.id === section?.categoryId) ?? null;
  // The state the API refuses, shown before it is reached rather than after:
  // a dish whose shelf names no category and which names none of its own would
  // be reachable from no chip on the home screen.
  const uncategorised = inherited === null && form.categoryId === '';

  return (
    <>
      {/* These three are the dish's own languages, not the panel's — the names
          go into `name_i18n` and are what a customer reads. They stay side by
          side whatever the panel is set to. */}
      <Field label={t('newDishNameHy')} required hint={t('newDishNameHyHint')}>
        {(id) => (
          <TextInput
            id={id}
            value={form.hy}
            onChange={(event) => onChange({ hy: event.target.value })}
            placeholder={t('newDishNameHyPlaceholder')}
            disabled={disabled}
            autoFocus
          />
        )}
      </Field>

      <div className="grid-2">
        <Field label={t('newDishNameRu')}>
          {(id) => (
            <TextInput
              id={id}
              value={form.ru}
              onChange={(event) => onChange({ ru: event.target.value })}
              disabled={disabled}
            />
          )}
        </Field>
        <Field label={t('newDishNameEn')}>
          {(id) => (
            <TextInput
              id={id}
              value={form.en}
              onChange={(event) => onChange({ en: event.target.value })}
              disabled={disabled}
            />
          )}
        </Field>
      </div>

      {/* The two numbers together, and the tab on its own line under them: a
          `.grid-2` holding one field stretches it to full width anyway, and a
          lone half-width box beside a gap reads as a field somebody forgot. */}
      <div className="grid-2">
        <Field label={t('newDishPrice')} required hint={t('newDishPriceHint')}>
          {(id) => (
            <TextInput
              id={id}
              inputMode="numeric"
              value={form.priceAmd}
              onChange={(event) => onChange({ priceAmd: event.target.value })}
              placeholder={t('newDishPricePlaceholder')}
              disabled={disabled}
            />
          )}
        </Field>
        {/* Optional, and left empty rather than guessed at: the row shows it to
            the kitchen and the branch's own average stands in when a dish does
            not say. Emptying it is how a dish stops claiming a time. */}
        <Field label={t('dishPrepMin')} hint={t('dishPrepMinHint')}>
          {(id) => (
            <TextInput
              id={id}
              inputMode="numeric"
              value={form.prepMin}
              onChange={(event) => onChange({ prepMin: event.target.value })}
              placeholder={t('dishPrepMinPlaceholder')}
              disabled={disabled}
            />
          )}
        </Field>
      </div>

      {/* Where the dish sits on this branch's page. The headings are the
          branch's own, so this list is as long as its menu says. */}
      <Field label={t('dishSection')} required hint={t('dishSectionHint')}>
        {(id) => (
          <Select
            id={id}
            value={form.sectionId}
            onValueChange={(sectionId) => onChange({ sectionId })}
            disabled={disabled || sections.length === 0}
            options={sections.map((entry) => ({
              value: entry.id,
              label: pickLabel(entry.nameI18n, language),
            }))}
          />
        )}
      </Field>

      {/* The other axis: what the city files this dish under. Almost always
          inherited, which is why "inherit" is the first option and names what
          it would inherit rather than saying "default". */}
      <Field
        label={t('dishCategory')}
        hint={inherited ? t('dishCategoryInheritHint') : t('dishCategoryOwnHint')}
      >
        {(id) => (
          <Select
            id={id}
            value={form.categoryId}
            onValueChange={(categoryId) => onChange({ categoryId })}
            disabled={disabled}
            options={[
              {
                value: '',
                label: inherited
                  ? t('dishCategoryInherit', { category: inherited.name })
                  : t('dishCategoryNone'),
              },
              ...categories.map((entry) => ({
                value: entry.id,
                label: entry.icon ? `${entry.icon} ${entry.name}` : entry.name,
              })),
            ]}
          />
        )}
      </Field>

      {uncategorised && <Banner tone="warn">{t('dishUncategorised')}</Banner>}

      {/* A property of the dish, not a place for it: a bestseller keeps its
          section and its category and appears on the Popular shelf as well. */}
      <Field label={t('dishPopular')} hint={t('dishPopularHint')}>
        {(id) => (
          <Switch
            id={id}
            checked={form.isPopular}
            onCheckedChange={(isPopular) => onChange({ isPopular })}
            disabled={disabled}
          />
        )}
      </Field>

      <Field label={t('dishPhoto')} required hint={photoHint}>
        {(id) => (
          <PhotoField id={id} url={form.photoUrl} upload={upload} disabled={disabled} />
        )}
      </Field>
    </>
  );
}

/**
 * Three fields are required, matching the API: the Armenian name, the price,
 * and the photo.
 *
 * `hy` because it is the fallback every other language resolves to, so a dish
 * without it would be nameless. The photo because a menu is a list somebody
 * reads with their eyes — a dish with no picture sits under the ones that have
 * one and does not get ordered — and this form is where it is given one at the
 * moment somebody is definitely thinking about the dish.
 */
export function NewDish({
  branchId,
  sections,
  categories,
  open,
  onOpenChange,
  onCreated,
}: {
  branchId: string;
  sections: StaffMenuSection[];
  categories: CategoryOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  // Opens on the branch's first heading rather than on nothing: a dish has to
  // go somewhere, and the top of the menu is the answer somebody would give.
  const [form, setForm] = useState<DishForm>(() => ({
    ...NO_DISH,
    sectionId: sections[0]?.id ?? '',
  }));
  const [busy, setBusy] = useState(false);
  const t = useT();
  const toast = useToast();

  const change = (patch: Partial<DishForm>): void =>
    setForm((current) => ({ ...current, ...patch }));
  const upload = usePhotoUpload((photoUrl) => change({ photoUrl }));

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    try {
      await api.createMenuItem({
        branchId,
        sectionId: form.sectionId,
        // Left out when the form says "inherit", which is what `''` means —
        // sending an empty string would be a category id the API cannot find.
        ...(form.categoryId === '' ? {} : { categoryId: form.categoryId }),
        ...(form.isPopular ? { isPopular: true } : {}),
        nameI18n: dishNames(form),
        priceAmd: Number(form.priceAmd.trim()),
        photoUrl: form.photoUrl,
        ...(form.prepMin.trim() === '' ? {} : { prepMin: Number(form.prepMin.trim()) }),
      });
      toast.success(t('newDishAdded', { dish: form.hy.trim() }));
      // Back to empty, but still pointed at a section: the next dish is
      // usually another one on the same shelf.
      setForm({ ...NO_DISH, sectionId: form.sectionId });
      // The file input keeps its selection independently of React state, so
      // without this the next dish opens on a form naming the previous one's
      // photograph and a submit button that will not enable.
      upload.clear();
      onCreated();
    } catch (err) {
      toast.error(errorText(t, err, 'errorCreateDish'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('newDishTitle')}
      description={t('newDishDesc')}
    >
      <form onSubmit={submit}>
        <DialogBody>
          <DishFields
            form={form}
            onChange={change}
            upload={upload}
            photoHint={t('newDishPhotoHint')}
            disabled={busy}
            sections={sections}
            categories={categories}
          />
        </DialogBody>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" disabled={busy}>
              {t('actionCancel')}
            </Button>
          </DialogClose>
          <Button
            type="submit"
            variant="primary"
            loading={busy}
            // `photoUrl` holds the URL of a file that is already stored, so this
            // waits for the upload to land rather than for a field to be typed
            // into — a dish cannot be added while its picture is still going up.
            //
            // The section is here too: a branch with no headings yet has
            // nowhere to put a dish, and the screen says so above this dialog.
            disabled={
              !dishFormValid(form) ||
              form.sectionId === '' ||
              form.photoUrl === '' ||
              upload.uploading
            }
          >
            {t('newDishSubmit')}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

/**
 * Changing a dish after it is on the menu.
 *
 * The same fields as adding one, opened on what the dish is now — which is what
 * makes the photograph replaceable at all. Everything else about a dish was
 * already editable from the row or was not editable anywhere: the price has its
 * box, the sold-out switch its column, and the picture, the names in the other
 * two languages and the tab had no way in at all short of deleting the dish and
 * adding it again.
 *
 * Only the fields that moved are sent. The API diffs the body against the row
 * before recording anything, so re-sending an untouched price is harmless — but
 * a form that submitted everything would also be overwriting whatever somebody
 * else changed in the meantime, which a PATCH of one field does not.
 */
export function EditDish({
  item,
  sections,
  categories,
  onOpenChange,
  onSaved,
}: {
  item: StaffMenuItem;
  sections: StaffMenuSection[];
  categories: CategoryOption[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<DishForm>(() => dishForm(item));
  const [busy, setBusy] = useState(false);
  // The panel's own language, for the title — the dish's three names are being
  // edited in the fields below, and the title has to call it something while
  // they are.
  const { language, t } = useLanguage();
  const toast = useToast();

  const change = (patch: Partial<DishForm>): void =>
    setForm((current) => ({ ...current, ...patch }));
  const upload = usePhotoUpload((photoUrl) => change({ photoUrl }));

  /** Null when nothing has moved, which is what holds the Save button: a PATCH
   *  that changes nothing writes no history entry either, so a form with
   *  nothing to save should say so rather than report success. */
  const patch = dishFormValid(form) ? dishPatch(item, form) : null;

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (patch === null) {
      return;
    }
    setBusy(true);
    try {
      await api.updateMenuItem(item.id, patch);
      toast.success(t('editDishSaved', { dish: form.hy.trim() }));
      onSaved();
    } catch (err) {
      toast.error(errorText(t, err, 'errorSave'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={t('editDishTitle', { dish: pickLabel(item.nameI18n, language) })}
      description={t('editDishDesc')}
    >
      <form onSubmit={submit}>
        <DialogBody>
          <DishFields
            form={form}
            onChange={change}
            upload={upload}
            photoHint={t('editDishPhotoHint')}
            disabled={busy}
            sections={sections}
            categories={categories}
          />
        </DialogBody>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" disabled={busy}>
              {t('actionCancel')}
            </Button>
          </DialogClose>
          <Button
            type="submit"
            variant="primary"
            loading={busy}
            disabled={patch === null || upload.uploading}
          >
            {t('actionSave')}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
