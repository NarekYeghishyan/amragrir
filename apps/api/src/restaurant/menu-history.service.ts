import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditEntity, Permission } from '@amragrir/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { StaffJwtPayload } from '../staff/staff-token.service';
import { menuScope } from '../staff/scope';
import {
  MENU_AUDIT_INCLUDE,
  toMenuHistoryEntry,
  type MenuHistoryEntry,
} from './menu-history';

/**
 * Reading one dish's history.
 *
 * The menu screen can say what a dish costs today. It could not say what it cost
 * last week, who changed it, or which of two managers marked it sold out over
 * the weekend — a column is overwritten by every edit, so those questions only
 * have answers because `MenuService` writes each change to `audit_log` as it
 * happens. This endpoint is where those answers are finally readable.
 *
 * Its own service rather than a method on `MenuService`, following
 * `OrderHistoryService`: that class writes menu changes inside transactions and
 * has no business also being the thing that reads them back, and keeping the
 * reader separate means nothing in the writer can accidentally read unscoped.
 */
@Injectable()
export class MenuHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Everything recorded about one dish, oldest first — a story reads forwards,
   * the same direction an order's timeline runs.
   *
   * **The dish is what is scoped, not the entries.** Reach is checked as a query
   * against `menu_items`, like every other back-office read, so a dish outside
   * the caller's reach is a 404 rather than a refusal that confirms it exists.
   * The entries need no second filter: `branch_id` cannot move on a menu item
   * (no endpoint updates it), so every row about a dish happened in the branch
   * whose reach was just checked.
   *
   * `menu:read`, not `staff:activity`. The two answer different questions and
   * the split is deliberate: this is a record of one *dish*, which whoever may
   * read the menu may read — the same rule that puts an order's timeline behind
   * `orders:read`. `staff:activity` is a record of a *person's* working day
   * across every dish they touched, and that is a different power.
   *
   * **Soft-deleted dishes are included** — deliberately not filtered through
   * `LIVE_MENU_ITEM` like every other menu read. A dish taken off the menu is
   * precisely the one somebody comes here to ask about, and a history that
   * disappeared along with its subject would be missing at the moment it is
   * wanted. Nothing here can be edited, so there is no risk of a stale panel
   * writing to a withdrawn dish through this route.
   */
  async list(staff: StaffJwtPayload, menuItemId: string): Promise<{ items: MenuHistoryEntry[] }> {
    const dish = await this.prisma.menuItem.findFirst({
      where: { id: menuItemId, ...menuScope(staff.scopes, Permission.MenuRead) },
      select: { id: true },
    });
    if (!dish) {
      throw new NotFoundException('Menu item not found');
    }

    const rows = await this.prisma.auditLog.findMany({
      // `entity` as well as `entity_id`, because `entity_id` is not a foreign
      // key — it holds whichever table `entity` names, and two tables can hand
      // out the same uuid. This pair is also exactly what `audit_log(entity,
      // entity_id)` indexes.
      where: { entity: AuditEntity.MenuItem, entityId: menuItemId },
      include: MENU_AUDIT_INCLUDE,
      // `created_at` defaults to the *transaction's* start time in Postgres, so
      // two entries written by one transaction tie. `id` is the tiebreak:
      // arbitrary, but the same arbitrary order on every request — a timeline
      // that reshuffles between two reads is one nobody can quote in a dispute.
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return { items: rows.map(toMenuHistoryEntry) };
  }
}
