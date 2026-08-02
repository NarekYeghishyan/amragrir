import type { Prisma } from '@prisma/client';
import type { AuditAction } from '@amragrir/shared';

/**
 * One dish's history, as it is read.
 *
 * Writing it is `MenuService`, which records every menu change to `audit_log` in
 * the same transaction as the change itself. This is the read half, and the
 * split is the one `order-history.ts` already makes for the same reason: the
 * write has to join the transaction it describes, and only the read can be a
 * query of its own.
 *
 * Nothing new is stored for this. `audit_log` has carried `menu_item.*` since it
 * existed and is indexed on `(entity, entity_id)` — the question "everything that
 * happened to *this* dish" was answerable all along, and simply had no endpoint.
 */

/** Who made one change, resolved for display. */
export interface MenuHistoryActor {
  /**
   * The `staff_users` row, so a name in the timeline can be a link to the person
   * rather than a string somebody has to go and search for. Null for an account
   * since deleted (`ON DELETE SET NULL` — the entry outlives the actor) and for
   * the entries the seed writes with no actor at all.
   *
   * An id and nothing else: the screen it opens needs `staff:read`, which
   * `menu:read` does not imply, so this is a destination rather than a
   * disclosure — whoever follows it is answered by that endpoint, on their own
   * permissions.
   */
  id: string | null;
  name: string | null;
  /** The person actually at the keyboard, when the account above was being
   *  impersonated. Null in the ordinary case, which is nearly all of them. */
  impersonatedBy: string | null;
  /** The impersonator's `staff_users` id, paired with `impersonatedBy` the way
   *  `id` is paired with `name`. */
  impersonatedById: string | null;
}

/**
 * One thing that happened to a dish.
 *
 * `before`/`after` are handed over as they were recorded rather than rendered
 * into a sentence here, for the reason every other string in the back office is
 * built in the panel: the API answers in the language of the request, but a
 * price has to be formatted the way the row above it is and a field has to be
 * named the way the form that edits it is — and those are translated there.
 *
 * Which keys are set is a function of the action, and the panel relies on it:
 *
 * - `menu_item.create` — `after` only, holding what the dish went on the menu
 *   at. There was no previous version, so there is nothing to diff against.
 * - `menu_item.update` / `.availability` — the changed fields in both, plus
 *   `before.nameI18n` as a label on every entry whether the name moved or not.
 *   So **the keys of `after` are the diff** and `before` may hold one more.
 * - `menu_item.delete` — `before` only: what the dish was when it was withdrawn.
 */
export interface MenuHistoryEntry {
  id: string;
  action: AuditAction;
  actor: MenuHistoryActor;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  at: string;
}

/** The names an entry needs. Exported so the query and the mapper cannot drift
 *  into disagreeing about which relations are loaded. */
export const MENU_AUDIT_INCLUDE = {
  actor: { select: { id: true, name: true } },
  actingStaff: { select: { id: true, name: true } },
} satisfies Prisma.AuditLogInclude;

export type MenuAuditLogRow = Prisma.AuditLogGetPayload<{ include: typeof MENU_AUDIT_INCLUDE }>;

export function toMenuHistoryEntry(row: MenuAuditLogRow): MenuHistoryEntry {
  return {
    id: row.id,
    action: row.action as AuditAction,
    actor: {
      id: row.actor?.id ?? null,
      name: row.actor?.name ?? null,
      impersonatedBy: row.actingStaff?.name ?? null,
      impersonatedById: row.actingStaff?.id ?? null,
    },
    before: (row.before as Record<string, unknown> | null) ?? null,
    after: (row.after as Record<string, unknown> | null) ?? null,
    at: row.createdAt.toISOString(),
  };
}
