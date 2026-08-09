import { Language, MenuTab } from '@amragrir/shared';
import type { MenuItemPatch, StaffMenuItem } from './api';

/**
 * What a dish form holds, and what it is worth sending.
 *
 * Separate from the form itself because none of it is about React: which fields
 * a form is allowed to submit, and which of them actually moved, are rules — and
 * rules that decide whether somebody's price reaches the API are worth testing
 * without a browser in the way.
 */

/**
 * The fields of the add/edit form, **as typed**.
 *
 * Numbers are strings here on purpose: "2500x" and "" are states the form can be
 * in, and a `number` cannot hold either without pretending it is `NaN` or zero.
 * They become numbers at the edge, in `dishPatch`, once `dishFormValid` has said
 * they are numbers at all.
 */
export interface DishForm {
  /** Required — the fallback every other language resolves to. */
  hy: string;
  ru: string;
  en: string;
  priceAmd: string;
  /** `''` is "does not say", which is a real answer and not a missing one. */
  prepMin: string;
  menuTab: MenuTab;
  /** The URL of a photograph **already stored** by the upload endpoint, or `''`
   *  for a dish that has none yet. */
  photoUrl: string;
}

/** An empty form — what "Add a dish" opens on. */
export const NO_DISH: DishForm = {
  hy: '',
  ru: '',
  en: '',
  priceAmd: '',
  prepMin: '',
  menuTab: MenuTab.Mains,
  photoUrl: '',
};

/** The form a dish opens on: what it is now, so that saving with nothing typed
 *  is a no-op rather than a wipe. */
export function dishForm(item: StaffMenuItem): DishForm {
  return {
    hy: item.nameI18n[Language.Hy] ?? '',
    ru: item.nameI18n[Language.Ru] ?? '',
    en: item.nameI18n[Language.En] ?? '',
    priceAmd: String(item.priceAmd),
    prepMin: item.prepMin === null ? '' : String(item.prepMin),
    menuTab: item.menuTab,
    photoUrl: item.photoUrl ?? '',
  };
}

/**
 * The three names as the API takes them.
 *
 * Trimmed, and blanks dropped rather than sent as `""` — an empty string is not
 * a translation, and it would beat the `hy` fallback when the app resolves a
 * name. The API strips them too; doing it here as well is what makes "did the
 * name change" answerable without asking.
 */
export function dishNames(form: DishForm): Record<string, string> {
  const names: Record<string, string> = { [Language.Hy]: form.hy.trim() };
  if (form.ru.trim() !== '') {
    names[Language.Ru] = form.ru.trim();
  }
  if (form.en.trim() !== '') {
    names[Language.En] = form.en.trim();
  }
  return names;
}

/** A whole number at or above `least`, or null for anything else — including
 *  `"2.5"`, `"1e3"` and the empty string, all of which `Number()` alone is
 *  happy to turn into something. */
function whole(value: string, least: number): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const parsed = Number(trimmed);
  return parsed >= least ? parsed : null;
}

/**
 * Whether the form could be sent at all.
 *
 * Only the rules the panel can check for itself: a name, a price that is a whole
 * number of dram, and a prep time that is either blank or a whole number of
 * minutes. The ceilings (`10,000,000` dram, `480` minutes) are the API's and are
 * left to it — it answers with a sentence this would only be paraphrasing.
 *
 * `0` minutes passes, and is not the same as leaving the box empty: a bottle of
 * water is handed over rather than cooked, and blank would make the branch's
 * average stand in and promise a wait that is not there.
 *
 * The photograph is deliberately **not** here. A dish being edited already has
 * one and this cannot take it away; a dish being added has to have one, which is
 * the add form's own rule.
 */
export function dishFormValid(form: DishForm): boolean {
  return (
    form.hy.trim() !== '' &&
    whole(form.priceAmd, 0) !== null &&
    (form.prepMin.trim() === '' || whole(form.prepMin, 0) !== null)
  );
}

/**
 * What changed, or null if nothing did.
 *
 * Null is what the Save button reads to stay disabled: a PATCH that moves
 * nothing writes no history entry at the API either, so the honest thing for a
 * form with nothing to save is to say so rather than to send a request and
 * report success.
 *
 * Assumes `dishFormValid`.
 */
export function dishPatch(item: StaffMenuItem, form: DishForm): MenuItemPatch | null {
  const patch: MenuItemPatch = {};

  const names = dishNames(form);
  if (!sameNames(names, item.nameI18n)) {
    patch.nameI18n = names;
  }

  const priceAmd = Number(form.priceAmd.trim());
  if (priceAmd !== item.priceAmd) {
    patch.priceAmd = priceAmd;
  }

  const prepMin = form.prepMin.trim() === '' ? null : Number(form.prepMin.trim());
  if (prepMin !== item.prepMin) {
    patch.prepMin = prepMin;
  }

  if (form.menuTab !== item.menuTab) {
    patch.menuTab = form.menuTab;
  }

  // Never `''`, which is what the field holds while an upload is still running
  // or on a dish that predates photos being required. The API refuses it, and
  // it does not mean "remove the picture" — nothing in this panel does.
  if (form.photoUrl !== '' && form.photoUrl !== item.photoUrl) {
    patch.photoUrl = form.photoUrl;
  }

  return Object.keys(patch).length === 0 ? null : patch;
}

/** Compared language by language rather than as JSON: both sides are built from
 *  the same three keys, but a stored column carries them in whatever order the
 *  insert did, and key order is not a change to a name.
 *
 *  Those three are all of them — `I18nTextDto` in the API carries a
 *  compile-time proof that `Language` has no fourth member. */
function sameNames(a: Record<string, string>, b: Record<string, string>): boolean {
  return Object.values(Language).every((language) => (a[language] ?? '') === (b[language] ?? ''));
}
