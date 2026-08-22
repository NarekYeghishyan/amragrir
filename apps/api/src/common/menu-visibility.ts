/**
 * Which dishes still count.
 *
 * `menu_items` is soft-deleted: taking a dish off the menu sets `deleted_at`
 * rather than removing the row, because `order_items` references it and an order
 * that can no longer say what was bought is not an order.
 *
 * The consequence is that **every** read has to say so, and the cost of one
 * forgetting is not cosmetic:
 *
 * - the public menu would show customers a withdrawn dish;
 * - the lookup order placement validates against would let them buy it;
 * - the panel would offer it for editing.
 *
 * So it is one exported constant rather than `deletedAt: null` written out four
 * times: a new read path is a grep away from the list of places that need it,
 * and a missing one is visible as an absence of this name.
 *
 * It lives in `common/` rather than beside the menu service because the three
 * callers are in three different feature modules, and none of them should have
 * to import from another's folder to ask a question this basic.
 */
export const LIVE_MENU_ITEM = { deletedAt: null } as const;

/**
 * The same, for the headings the dishes sit under.
 *
 * `branch_menu_sections` is soft-deleted for the same reason and with the same
 * consequence: a withdrawn dish still points at its section, so the row cannot
 * leave, and every read that draws a menu has to say it wants the live ones.
 *
 * Note what this does **not** do: filtering sections does not filter the dishes
 * under them. A retired section can only be retired once it holds no live dish
 * (`MenuSectionsService.remove`), which is what keeps the two consistent
 * without every menu query having to join.
 */
export const LIVE_MENU_SECTION = { deletedAt: null } as const;
