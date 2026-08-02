import type { Prisma } from '@prisma/client';
import { AUDIT_ACTION_ENTITY, type AuditAction } from '@amragrir/shared';
import type { StaffJwtPayload } from '../staff/staff-token.service';

/**
 * Writing `audit_log`.
 *
 * Reading it is `StaffActivityService`, and the split is the same one
 * `order-history.ts` makes for the same reason: the write has to happen inside
 * the transaction that performs the change, and the read is the only half that
 * can be a query of its own.
 *
 * Every entry here has a **staff** actor — that is what distinguishes this table
 * from `order_events`, whose actor is usually the customer or the payment
 * provider. If an action can be taken by somebody who is not staff, it does not
 * belong here.
 */

/** Where an action happened, for the reach filter the feed is read through. */
export interface AuditScope {
  /** The restaurant, written whenever it is known — including for a branch-level
   *  action, so a restaurant admin reaches it without a join. */
  restaurantId?: string | null;
  branchId?: string | null;
}

export interface RecordedAudit {
  action: AuditAction;
  /** Which row it happened to. Null when the action created nothing durable, or
   *  when the row is already gone by the time the entry is written. */
  entityId?: string | null;
  scope?: AuditScope;
  /**
   * Only the fields that changed, and only ones safe to show whoever may read
   * this person's activity. `before` is what makes a deletion readable at all
   * for the entities that are hard-deleted — it is the last remaining record of
   * what the thing was.
   *
   * Never put a password hash, a token or an invite secret in either.
   */
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  ip?: string | null;
}

/**
 * The staff member behind an entry — and, when the session is an impersonation,
 * the super admin really at the keyboard.
 *
 * `sub` is the account being acted as, which is what every guard and every scope
 * filter already uses; recording it alone would put an impersonated change
 * against the name of somebody who was not there. `act` is the difference, and
 * it is the whole reason `audit_log.acting_staff_id` exists.
 */
export function auditActor(staff: StaffJwtPayload): {
  actorStaffId: string;
  actingStaffId: string | null;
} {
  return { actorStaffId: staff.sub, actingStaffId: staff.act ?? null };
}

/**
 * One entry as Prisma write data.
 *
 * `entity` is derived rather than passed: it is a function of the action
 * (`AUDIT_ACTION_ENTITY`), so a caller cannot pair a menu action with a staff
 * entity and produce a row that `audit_log(entity, entity_id)` indexes wrongly.
 */
export function auditData(
  staff: StaffJwtPayload,
  entry: RecordedAudit,
): Prisma.AuditLogUncheckedCreateInput {
  const { actorStaffId, actingStaffId } = auditActor(staff);
  return {
    actorStaffId,
    actingStaffId,
    action: entry.action,
    entity: AUDIT_ACTION_ENTITY[entry.action],
    entityId: entry.entityId ?? null,
    restaurantId: entry.scope?.restaurantId ?? null,
    branchId: entry.scope?.branchId ?? null,
    before: entry.before,
    after: entry.after,
    ip: entry.ip ?? null,
  };
}

/**
 * The fields that actually changed, as a `before`/`after` pair.
 *
 * A PATCH body carries what the caller *sent*, not what moved: a form that
 * submits every field re-sends the price it did not touch, and an entry saying
 * "changed the price from 2400 to 2400" is noise that makes the real ones harder
 * to find. Comparing against the loaded row is what keeps the feed worth reading.
 *
 * Returns null when nothing moved, which the caller uses to skip the entry
 * entirely — a PATCH that changed nothing is not an event.
 */
export function changedFields<T extends Record<string, unknown>>(
  before: T,
  patch: Partial<T>,
): { before: Prisma.InputJsonObject; after: Prisma.InputJsonObject } | null {
  // Built as plain records and handed back as Prisma's JSON object, whose index
  // signature is read-only and so cannot be accumulated into. The values arrive
  // as `unknown` from a loaded row and a DTO; in practice they are scalars,
  // string arrays and i18n objects, and the `JSON.stringify` below is what would
  // fail loudly on anything that is not serialisable.
  const from: Record<string, unknown> = {};
  const to: Record<string, unknown> = {};

  for (const [key, next] of Object.entries(patch)) {
    if (next === undefined) {
      continue;
    }
    const current = before[key];
    // JSON comparison, because the values here are scalars, string arrays
    // (`dietary_tags`) and i18n objects. Reference equality would report every
    // array as changed; a deep-equality dependency for three shapes is not worth
    // it, and both sides are about to be stored as JSON anyway.
    if (JSON.stringify(current ?? null) === JSON.stringify(next ?? null)) {
      continue;
    }
    from[key] = current ?? null;
    to[key] = next ?? null;
  }

  if (Object.keys(to).length === 0) {
    return null;
  }
  return {
    before: from as Prisma.InputJsonObject,
    after: to as Prisma.InputJsonObject,
  };
}
