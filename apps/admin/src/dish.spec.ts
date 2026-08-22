import { describe, expect, it } from 'vitest';
import type { StaffMenuItem } from './api';
import { dishForm, dishFormValid, dishNames, dishPatch, NO_DISH, type DishForm } from './dish';

/**
 * What an edit sends, and what it refuses to.
 *
 * These are the rules between a form somebody typed into and a PATCH that
 * changes a live menu: which fields count as moved, what a blank box means, and
 * when there is nothing to save at all. All of it decided without React, which
 * is why it can be read here in one screen instead of driven through a dialog.
 */
const DISH: StaffMenuItem = {
  id: 'd1',
  branchId: 'b1',
  categoryId: null,
  effectiveCategoryId: 'cat-grill',
  sectionId: 'sec-1',
  isPopular: false,
  nameI18n: { hy: 'Խորոված', ru: 'Хоровац' },
  descI18n: null,
  priceAmd: 5800,
  caloriesKcal: null,
  prepMin: 25,
  photoUrl: 'https://cdn.amragrir.am/khorovats.jpg',
  dietaryTags: [],
  isAvailable: true,
};

/** The form as the dialog opens it, with whatever this case changes. */
const typed = (over: Partial<DishForm> = {}): DishForm => ({ ...dishForm(DISH), ...over });

describe('dishForm', () => {
  it('opens on what the dish is now', () => {
    expect(dishForm(DISH)).toEqual({
      hy: 'Խորոված',
      ru: 'Хоровац',
      en: '',
      priceAmd: '5800',
      prepMin: '25',
      sectionId: 'sec-1',
      categoryId: '',
      isPopular: false,
      photoUrl: 'https://cdn.amragrir.am/khorovats.jpg',
    });
  });

  it('opens a dish with no prep time on an empty box, not on a zero', () => {
    // "0 minutes" is a claim; an empty box is the absence of one, and the API
    // refuses 0 anyway (`@Min(1)`).
    expect(dishForm({ ...DISH, prepMin: null }).prepMin).toBe('');
  });

  it('opens a dish from before photos were required on no photo', () => {
    expect(dishForm({ ...DISH, photoUrl: null }).photoUrl).toBe('');
  });

  it('changes nothing on its own', () => {
    expect(dishPatch(DISH, dishForm(DISH))).toBeNull();
  });
});

describe('dishNames', () => {
  it('sends the three languages that were filled in', () => {
    expect(dishNames(typed({ en: 'Barbecue' }))).toEqual({
      hy: 'Խորոված',
      ru: 'Хоровац',
      en: 'Barbecue',
    });
  });

  it('drops a language left blank rather than sending an empty string', () => {
    // An empty string is not a translation, and it would beat the `hy` fallback
    // when the app resolves a name — a dish called "" for every Russian guest.
    expect(dishNames(typed({ ru: '   ' }))).toEqual({ hy: 'Խորոված' });
  });

  it('trims what was pasted in', () => {
    expect(dishNames(typed({ hy: '  Խորոված  ' }))).toEqual({
      hy: 'Խորոված',
      ru: 'Хоровац',
    });
  });
});

describe('dishFormValid', () => {
  it('accepts the dish as it stands', () => {
    expect(dishFormValid(dishForm(DISH))).toBe(true);
  });

  it.each([
    ['no Armenian name', { hy: '' }],
    ['an Armenian name of spaces', { hy: '  ' }],
    ['no price', { priceAmd: '' }],
    ['a price that is not a number', { priceAmd: '2500 dram' }],
    ['a price with a decimal point — dram has no minor unit', { priceAmd: '2500.5' }],
    ['a negative price', { priceAmd: '-100' }],
    ['a prep time that is not a number', { prepMin: 'quick' }],
    ['a negative prep time', { prepMin: '-5' }],
  ])('refuses %s', (_case, over) => {
    expect(dishFormValid(typed(over))).toBe(false);
  });

  it('accepts an empty prep time, which is a dish that does not say', () => {
    expect(dishFormValid(typed({ prepMin: '' }))).toBe(true);
  });

  it('accepts a prep time of zero, which is a dish that needs no cooking', () => {
    // A bottle of water is handed over, not made. Different from empty: empty
    // lets the branch average stand in and promises a wait that is not there.
    expect(dishFormValid(typed({ prepMin: '0' }))).toBe(true);
  });

  it('leaves the ceilings to the API, which answers in a sentence', () => {
    // 10,000,000 dram and 480 minutes are refused there. Repeating them here
    // would be two more numbers to keep in step for no gain — the panel shows
    // what the API said.
    expect(dishFormValid(typed({ priceAmd: '99999999', prepMin: '5000' }))).toBe(true);
  });

  it('says nothing about the photograph', () => {
    // An edit cannot take a photo away, and an added dish having one is the add
    // form's own rule. Neither belongs to a form's arithmetic.
    expect(dishFormValid(typed({ photoUrl: '' }))).toBe(true);
    expect(dishFormValid({ ...NO_DISH, hy: 'Սալաթ', priceAmd: '1200' })).toBe(true);
  });
});

describe('dishPatch', () => {
  it('sends the price alone when the price alone moved', () => {
    expect(dishPatch(DISH, typed({ priceAmd: '6200' }))).toEqual({ priceAmd: 6200 });
  });

  it('sends every name when one of them changes — the column is replaced whole', () => {
    expect(dishPatch(DISH, typed({ en: 'Barbecue' }))).toEqual({
      nameI18n: { hy: 'Խորոված', ru: 'Хоровац', en: 'Barbecue' },
    });
  });

  it('sends the section it was moved to', () => {
    expect(dishPatch(DISH, typed({ sectionId: 'sec-2' }))).toEqual({ sectionId: 'sec-2' });
  });

  it('sends the Popular shelf as a flag, not as a move', () => {
    // A bestseller keeps its section and its category — the old four-tab enum
    // forced a dish to choose between being popular and being pizza.
    expect(dishPatch(DISH, typed({ isPopular: true }))).toEqual({ isPopular: true });
  });

  it('sends null when a dish stops naming its own category', () => {
    // `''` in the form is "inherit from the section", which the API spells
    // `null`. Sending nothing would leave a stale override in place.
    const own = { ...DISH, categoryId: 'cat-healthy' };

    expect(dishPatch(own, { ...dishForm(own), categoryId: '' })).toEqual({ categoryId: null });
  });

  it('sends the new photograph', () => {
    const photoUrl = 'http://localhost:3000/uploads/menu/aa.jpg';

    expect(dishPatch(DISH, typed({ photoUrl }))).toEqual({ photoUrl });
  });

  it('clears the prep time with null when the box is emptied', () => {
    // The one field where null means something rather than being a mistake: an
    // estimate can turn out to be wrong, and a panel that could set one but
    // never unset it would make every guess permanent.
    expect(dishPatch(DISH, typed({ prepMin: '' }))).toEqual({ prepMin: null });
  });

  it('sends a prep time of zero rather than mistaking it for an empty box', () => {
    // The falsy trap: `0` is a claim the kitchen makes, `null` is it declining
    // to make one, and the two schedule an order differently.
    expect(dishPatch(DISH, typed({ prepMin: '0' }))).toEqual({ prepMin: 0 });
  });

  it('does not send a prep time that was already absent', () => {
    const without = { ...DISH, prepMin: null };

    expect(dishPatch(without, dishForm(without))).toBeNull();
  });

  it('never sends an empty photograph', () => {
    // What the field holds while an upload is still running, and on a dish from
    // before photos were required. The API refuses `""`, and it does not mean
    // "remove the picture" — nothing in this panel does.
    expect(dishPatch({ ...DISH, photoUrl: null }, typed({ photoUrl: '' }))).toBeNull();
  });

  it('carries everything that moved in one request', () => {
    expect(
      dishPatch(
        DISH,
        typed({ hy: 'Խորոված խոզի', priceAmd: '6400', prepMin: '30', isPopular: true }),
      ),
    ).toEqual({
      nameI18n: { hy: 'Խորոված խոզի', ru: 'Хоровац' },
      priceAmd: 6400,
      prepMin: 30,
      isPopular: true,
    });
  });

  it('ignores whitespace typed around a number', () => {
    expect(dishPatch(DISH, typed({ priceAmd: ' 5800 ', prepMin: ' 25 ' }))).toBeNull();
  });

  it('does not call a stored name changed for the order its keys are in', () => {
    // A JSON column carries its keys in whatever order the insert did. Key order
    // is not a change to a name, and a form that thought it was would rewrite
    // every dish it was merely opened on.
    const reordered = { ...DISH, nameI18n: { ru: 'Хоровац', hy: 'Խորոված' } };

    expect(dishPatch(reordered, dishForm(reordered))).toBeNull();
  });
});
