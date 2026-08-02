import { AuditAction, AuditEntity } from '@amragrir/shared';
import { auditData, changedFields } from './audit';
import type { StaffJwtPayload } from '../staff/staff-token.service';

const actor: StaffJwtPayload = { sub: 'staff-1', kind: 'staff', scopes: [] };
const acting: StaffJwtPayload = { sub: 'staff-2', kind: 'staff', scopes: [], act: 'super-1' };

describe('changedFields', () => {
  it('reports only what actually moved', () => {
    // A form that submits every field re-sends the price nobody touched. An
    // entry saying "changed the price from 2400 to 2400" is the noise that
    // makes a real change hard to find.
    const changed = changedFields(
      { priceAmd: 2400, prepMin: 12, photoUrl: null },
      { priceAmd: 2600, prepMin: 12 },
    );

    expect(changed).toEqual({ before: { priceAmd: 2400 }, after: { priceAmd: 2600 } });
  });

  it('is null when a patch changes nothing', () => {
    // The caller skips the entry entirely on null: a PATCH that moved nothing
    // is not something somebody did.
    expect(changedFields({ priceAmd: 2400 }, { priceAmd: 2400 })).toBeNull();
  });

  it('ignores fields the patch does not carry', () => {
    // `undefined` means "not sent", which is not the same as "cleared" — a
    // PATCH naming one field must not record the other five as blanked.
    expect(changedFields({ priceAmd: 2400, prepMin: 12 }, { prepMin: undefined })).toBeNull();
  });

  it('tells null and a value apart', () => {
    // Annotated, or `T` infers as `{ photoUrl: null }` from the first argument
    // and the patch can never be anything else.
    const changed = changedFields<{ photoUrl: string | null }>(
      { photoUrl: null },
      { photoUrl: 'https://x/y.jpg' },
    );
    expect(changed).toEqual({
      before: { photoUrl: null },
      after: { photoUrl: 'https://x/y.jpg' },
    });
  });

  it('compares arrays and i18n objects by value', () => {
    // Reference equality would report every array as changed, and every menu
    // edit would claim the dietary tags moved.
    expect(changedFields({ dietaryTags: ['vegan'] }, { dietaryTags: ['vegan'] })).toBeNull();
    expect(
      changedFields({ nameI18n: { hy: 'Բուրգեր' } }, { nameI18n: { hy: 'Բուրգեր' } }),
    ).toBeNull();
    expect(changedFields({ dietaryTags: ['vegan'] }, { dietaryTags: ['halal'] })).not.toBeNull();
  });
});

describe('auditData', () => {
  it('derives the entity from the action', () => {
    // Passing both would let a caller pair a menu action with a staff entity
    // and produce a row that `audit_log(entity, entity_id)` indexes wrongly.
    const data = auditData(actor, { action: AuditAction.MenuItemUpdate, entityId: 'item-1' });

    expect(data.entity).toBe(AuditEntity.MenuItem);
    expect(data.action).toBe('menu_item.update');
  });

  it('records the impersonator separately from the account acted as', () => {
    // `sub` is the account being acted as, which every guard already uses.
    // Recording it alone would file the change against somebody who was not
    // at the keyboard.
    const data = auditData(acting, { action: AuditAction.MenuItemDelete });

    expect(data.actorStaffId).toBe('staff-2');
    expect(data.actingStaffId).toBe('super-1');
  });

  it('leaves the impersonator null on an ordinary session', () => {
    expect(auditData(actor, { action: AuditAction.MenuItemDelete }).actingStaffId).toBeNull();
  });

  it('writes both scope columns, and null for a platform action', () => {
    // Both are written wherever both are known, so a restaurant admin reaches a
    // branch-level row without a join. Both null is platform scope — readable
    // only by an account whose reach is unscoped.
    const scoped = auditData(actor, {
      action: AuditAction.MenuItemCreate,
      scope: { restaurantId: 'rest-1', branchId: 'branch-1' },
    });
    expect(scoped.restaurantId).toBe('rest-1');
    expect(scoped.branchId).toBe('branch-1');

    const platform = auditData(actor, { action: AuditAction.StaffImpersonate });
    expect(platform.restaurantId).toBeNull();
    expect(platform.branchId).toBeNull();
  });
});
