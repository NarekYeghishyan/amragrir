// The two axes of a menu, and the one rule that joins them.
// See docs/BUSINESS_LOGIC.md §6 and docs/DATABASE.md §5–6.

/**
 * What a dish is *called* by the city, given where its restaurant filed it.
 *
 * A dish's own category wins; failing that it inherits its section's. This is
 * the only place that rule is written down — the API filters with it, the panel
 * previews with it, and both clients display with it, so a fourth reading of
 * "which category is this, really" cannot appear.
 *
 * `null` means the dish is in no category at all: its section maps to none and
 * it named none of its own. Such a dish is unreachable from the home screen's
 * chips, which is why `POST /restaurant/menu-items` refuses to create one. Rows
 * predating that rule can still be null, and the panel flags them.
 */
export const effectiveCategoryId = (
  item: { categoryId: string | null },
  section: { categoryId: string | null } | null | undefined,
): string | null => item.categoryId ?? section?.categoryId ?? null;

/**
 * The id the clients use for the "Popular" pill, which is not a section.
 *
 * Popular is a showcase across the whole menu — a dish is popular *and* pizza —
 * so it has no row of its own and cannot collide with a real section id, which
 * is always a uuid.
 */
export const POPULAR_SECTION_ID = 'popular';

/**
 * What a platform category's `key` may look like.
 *
 * The key is the API contract: it travels in `?category=`, in deep links, and
 * in the placeholder filenames the seed writes. Lowercase ASCII so it survives
 * a URL, a filesystem and a spreadsheet unchanged — the display names are
 * `name_i18n`'s job and may be in any of the three languages.
 */
export const CATEGORY_KEY_PATTERN = /^[a-z][a-z0-9_]{1,39}$/;

/** How many dishes a filtered restaurant card shows in its slider. */
export const CARD_DISH_SLIDER_LIMIT = 10;
