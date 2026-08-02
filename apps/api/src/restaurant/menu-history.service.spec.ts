import { NotFoundException } from '@nestjs/common';
import { AuditAction, AuditEntity, StaffRole } from '@amragrir/shared';
import { MenuHistoryService } from './menu-history.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { StaffJwtPayload } from '../staff/staff-token.service';

/**
 * Reading one dish's history.
 *
 * The two things worth pinning down here are the scope check and the query, and
 * neither is cosmetic: the first is what stops this endpoint from being a way to
 * read any restaurant's menu changes by guessing a uuid, and the second is what
 * decides whether a timeline is a record or a shuffled list.
 */

const ITEM_ID = '22222222-2222-4222-8222-222222222222';
const RESTAURANT_ID = '44444444-4444-4444-8444-444444444444';

const admin: StaffJwtPayload = {
  sub: 'staff-1',
  kind: 'staff',
  scopes: [{ role: StaffRole.RestaurantAdmin, restaurantId: RESTAURANT_ID, branchId: null }],
};

function auditRow(over: Record<string, unknown> = {}) {
  return {
    id: 'audit-1',
    action: AuditAction.MenuItemUpdate,
    entity: AuditEntity.MenuItem,
    entityId: ITEM_ID,
    before: { priceAmd: 2400, nameI18n: { hy: 'Բուրգեր' } },
    after: { priceAmd: 2900 },
    createdAt: new Date('2026-08-01T10:00:00.000Z'),
    actor: { id: 'staff-9', name: 'Ani Vardanyan' },
    actingStaff: null,
    ...over,
  };
}

function build(options: { dish?: unknown; rows?: unknown[] } = {}) {
  const findMany = jest.fn().mockResolvedValue(options.rows ?? [auditRow()]);
  const findFirst = jest
    .fn()
    .mockResolvedValue(options.dish === undefined ? { id: ITEM_ID } : options.dish);

  const prisma = {
    menuItem: { findFirst },
    auditLog: { findMany },
  } as unknown as PrismaService;

  return { service: new MenuHistoryService(prisma), findFirst, findMany };
}

describe('MenuHistoryService', () => {
  it('refuses a dish outside the caller’s reach as a 404', async () => {
    // Not a 403: a refusal that distinguishes "not yours" from "does not exist"
    // confirms the dish exists to somebody who cannot see it.
    const { service, findMany } = build({ dish: null });

    await expect(service.list(admin, ITEM_ID)).rejects.toBeInstanceOf(NotFoundException);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('scopes the dish lookup rather than filtering after the fetch', async () => {
    const { service, findFirst } = build();

    await service.list(admin, ITEM_ID);

    // The reach is part of the `where`, so there is no code path that loads
    // somebody else's dish and then decides.
    const where = findFirst.mock.calls[0][0].where as Record<string, unknown>;
    expect(where.id).toBe(ITEM_ID);
    expect(where.OR).toEqual([
      { branch: { restaurantId: { in: [RESTAURANT_ID] } } },
      { branchId: { in: [] } },
    ]);
  });

  it('includes a dish that has been taken off the menu', async () => {
    // Deliberately *not* filtered through LIVE_MENU_ITEM like every other menu
    // read. A withdrawn dish is exactly the one somebody comes here to ask
    // about, and a history that vanished with its subject would be missing at
    // the moment it is wanted.
    const { service, findFirst } = build();

    await service.list(admin, ITEM_ID);

    expect(findFirst.mock.calls[0][0].where).not.toHaveProperty('deletedAt');
  });

  it('asks for this dish’s entries oldest first, keyed on entity and id', async () => {
    const { service, findMany } = build();

    await service.list(admin, ITEM_ID);

    const args = findMany.mock.calls[0][0];
    // `entity` as well as `entity_id`: the id column is not a foreign key, so
    // two tables can hand out the same uuid — and the pair is what the index
    // covers.
    expect(args.where).toEqual({ entity: AuditEntity.MenuItem, entityId: ITEM_ID });
    // Oldest first, with `id` breaking the ties that `created_at` (the
    // transaction's start time) genuinely produces.
    expect(args.orderBy).toEqual([{ createdAt: 'asc' }, { id: 'asc' }]);
  });

  it('hands back the recorded before/after untouched', async () => {
    // Rendered in the panel, not here: a price is formatted the way the row
    // above it is, and a field is named the way the form that edits it is —
    // both of which are translated there.
    const { service } = build();

    const { items } = await service.list(admin, ITEM_ID);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      action: AuditAction.MenuItemUpdate,
      before: { priceAmd: 2400, nameI18n: { hy: 'Բուրգեր' } },
      after: { priceAmd: 2900 },
      at: '2026-08-01T10:00:00.000Z',
      actor: { id: 'staff-9', name: 'Ani Vardanyan', impersonatedBy: null },
    });
  });

  it('names both people on an impersonated change', () => {
    // The account acted as, and the super admin really at the keyboard.
    // Recording only the first would file the change against somebody who was
    // not there — the whole reason `acting_staff_id` exists.
    const { service } = build({
      rows: [auditRow({ actingStaff: { id: 'staff-root', name: 'Demo Super Admin' } })],
    });

    return service.list(admin, ITEM_ID).then(({ items }) => {
      expect(items[0].actor).toMatchObject({
        name: 'Ani Vardanyan',
        impersonatedBy: 'Demo Super Admin',
        impersonatedById: 'staff-root',
      });
    });
  });

  it('survives an actor whose account has since been deleted', async () => {
    // `ON DELETE SET NULL` — the entry outlives the actor, and an entry with no
    // name is still a record that something happened at a time.
    const { service } = build({ rows: [auditRow({ actor: null })] });

    const { items } = await service.list(admin, ITEM_ID);

    expect(items[0].actor).toEqual({
      id: null,
      name: null,
      impersonatedBy: null,
      impersonatedById: null,
    });
  });
});
