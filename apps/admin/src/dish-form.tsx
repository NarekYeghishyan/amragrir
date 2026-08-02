import { useState, type FormEvent } from 'react';
import { MenuTab } from '@amragrir/shared';
import { api, errorText, type StaffMenuItem } from './api';
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
  Button,
  Dialog,
  DialogBody,
  DialogClose,
  DialogFooter,
  Field,
  Select,
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
}) {
  const t = useT();
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

      <Field label={t('newDishTab')}>
        {(id) => (
          <Select
            id={id}
            value={form.menuTab}
            onValueChange={(menuTab) => onChange({ menuTab })}
            disabled={disabled}
            options={Object.values(MenuTab).map((value) => ({
              value,
              label: t(`menuTab_${value}`),
            }))}
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
  open,
  onOpenChange,
  onCreated,
}: {
  branchId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<DishForm>(NO_DISH);
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
        menuTab: form.menuTab,
        nameI18n: dishNames(form),
        priceAmd: Number(form.priceAmd.trim()),
        photoUrl: form.photoUrl,
        ...(form.prepMin.trim() === '' ? {} : { prepMin: Number(form.prepMin.trim()) }),
      });
      toast.success(t('newDishAdded', { dish: form.hy.trim() }));
      setForm(NO_DISH);
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
            disabled={!dishFormValid(form) || form.photoUrl === '' || upload.uploading}
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
  onOpenChange,
  onSaved,
}: {
  item: StaffMenuItem;
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
