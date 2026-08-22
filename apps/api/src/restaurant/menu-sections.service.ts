import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditAction, Permission } from '@amragrir/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { changedFields } from '../audit/audit';
import { LIVE_MENU_ITEM, LIVE_MENU_SECTION } from '../common/menu-visibility';
import type { StaffJwtPayload } from '../staff/staff-token.service';
import { branchScope, menuSectionScope } from '../staff/scope';
import { stripEmpty } from './menu.service';
import {
  CreateMenuSectionDto,
  ListMenuSectionsDto,
  UpdateMenuSectionDto,
} from './menu.dto';

/**
 * One heading of one branch's menu, as the panel edits it.
 *
 * Raw `name_i18n` like every other staff-side shape: the caller is editing all
 * three languages, and resolving one for them would make the other two
 * invisible and silently unsaveable.
 */
export interface StaffMenuSection {
  id: string;
  branchId: string;
  categoryId: string | null;
  nameI18n: Record<string, string>;
  sortOrder: number;
  /** Live dishes filed here. What the panel counts before offering a delete,
   *  and what tells somebody why the delete was refused. */
  itemCount: number;
}

/**
 * The branch's own menu structure.
 *
 * Its own service rather than more of `MenuService` because it answers a
 * different question and its rules are all about the *shape* of a menu: what
 * headings exist, in what order, and which platform category each maps onto.
 * The dishes are `MenuService`'s.
 *
 * Everything here runs on `menu:write` — the same permission that already lets
 * somebody add and price a dish. A person trusted to write the menu is trusted
 * to say what it is divided into; a shift holding `menu:availability` is not.
 */
@Injectable()
export class MenuSectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    staff: StaffJwtPayload,
    query: ListMenuSectionsDto,
  ): Promise<{ items: StaffMenuSection[] }> {
    const where: Prisma.BranchMenuSectionWhereInput = {
      ...menuSectionScope(staff.scopes, Permission.MenuRead),
      ...LIVE_MENU_SECTION,
    };
    if (query.branchId) {
      // Narrows the scope, never replaces it.
      where.branchId = query.branchId;
    }

    const rows = await this.prisma.branchMenuSection.findMany({
      where,
      include: { _count: { select: { items: { where: LIVE_MENU_ITEM } } } },
      orderBy: [{ branchId: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
    });

    return { items: rows.map(toStaffMenuSection) };
  }

  async create(staff: StaffJwtPayload, dto: CreateMenuSectionDto): Promise<StaffMenuSection> {
    const restaurantId = await this.assertReachesBranch(staff, dto.branchId);
    await this.assertCategoryUsable(dto.categoryId);

    const name = stripEmpty(dto.nameI18n);
    // Last in the strip unless told otherwise. A new heading appearing in the
    // middle of a menu somebody has already ordered is a surprise; appearing at
    // the end is what adding one looks like.
    const sortOrder = dto.sortOrder ?? (await this.nextSortOrder(dto.branchId));

    const section = await this.prisma.$transaction(async (tx) => {
      const created = await tx.branchMenuSection.create({
        data: {
          branchId: dto.branchId,
          categoryId: dto.categoryId ?? null,
          nameI18n: name,
          sortOrder,
        },
        include: { _count: { select: { items: { where: LIVE_MENU_ITEM } } } },
      });

      await this.audit.record(tx, staff, {
        action: AuditAction.MenuSectionCreate,
        entityId: created.id,
        scope: { restaurantId, branchId: dto.branchId },
        after: { nameI18n: name, categoryId: created.categoryId, sortOrder },
      });

      return created;
    });

    return toStaffMenuSection(section);
  }

  async update(
    staff: StaffJwtPayload,
    id: string,
    dto: UpdateMenuSectionDto,
  ): Promise<StaffMenuSection> {
    const current = await this.load(staff, id);
    await this.assertCategoryUsable(dto.categoryId ?? undefined);

    // Unmapping a shelf is the one edit here that can take food out of the
    // catalogue: every dish that named no category of its own was relying on
    // this one, and would come out the other side reachable from no chip at
    // all. Refused with the count, so the message names the work rather than
    // the rule.
    if (dto.categoryId === null && current.categoryId !== null) {
      const stranded = await this.prisma.menuItem.count({
        where: { sectionId: id, categoryId: null, ...LIVE_MENU_ITEM },
      });
      if (stranded > 0) {
        throw new UnprocessableEntityException(
          `${stranded} dish(es) here have no category of their own and would become unfindable — give them one first, or leave this section mapped`,
        );
      }
    }

    const data: Prisma.BranchMenuSectionUpdateInput = {};
    if (dto.categoryId !== undefined) {
      data.category = dto.categoryId === null
        ? { disconnect: true }
        : { connect: { id: dto.categoryId } };
    }
    if (dto.nameI18n) {
      data.nameI18n = stripEmpty(dto.nameI18n);
    }
    if (dto.sortOrder !== undefined) {
      data.sortOrder = dto.sortOrder;
    }

    const changed = changedFields(
      {
        categoryId: current.categoryId,
        nameI18n: current.nameI18n,
        sortOrder: current.sortOrder,
      },
      {
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
        ...(dto.nameI18n ? { nameI18n: stripEmpty(dto.nameI18n) } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    );

    const section = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.branchMenuSection.update({
        where: { id },
        data,
        include: { _count: { select: { items: { where: LIVE_MENU_ITEM } } } },
      });

      if (changed) {
        await this.audit.record(tx, staff, {
          action: AuditAction.MenuSectionUpdate,
          entityId: id,
          scope: { restaurantId: current.branch.restaurantId, branchId: current.branchId },
          // The name travels whether or not it moved, as it does for a dish:
          // "changed the category" with no heading named sends the reader off
          // to look up which shelf it was.
          before: { ...changed.before, nameI18n: current.nameI18n as Prisma.InputJsonValue },
          after: changed.after,
        });
      }

      return updated;
    });

    return toStaffMenuSection(section);
  }

  /**
   * Retires a heading.
   *
   * A soft delete, like a dish: withdrawn dishes still point here and their
   * orders still point at them, so the row cannot leave. The menu stops drawing
   * it and the panel stops offering it.
   *
   * **Refused while live dishes sit under it**, with the count. The alternative
   * — moving them somewhere automatically — would put food on a shelf nobody
   * chose, and there may be no other shelf to choose. Emptying it first is one
   * more step and the only one that leaves a menu somebody meant.
   */
  async remove(staff: StaffJwtPayload, id: string): Promise<void> {
    const current = await this.load(staff, id);

    const live = await this.prisma.menuItem.count({
      where: { sectionId: id, ...LIVE_MENU_ITEM },
    });
    if (live > 0) {
      throw new ConflictException(
        `${live} dish(es) are still in this section — move or remove them first`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.branchMenuSection.update({ where: { id }, data: { deletedAt: new Date() } });

      await this.audit.record(tx, staff, {
        action: AuditAction.MenuSectionDelete,
        entityId: id,
        scope: { restaurantId: current.branch.restaurantId, branchId: current.branchId },
        before: {
          nameI18n: current.nameI18n as Prisma.InputJsonValue,
          categoryId: current.categoryId,
        },
      });
    });
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private async assertReachesBranch(staff: StaffJwtPayload, branchId: string): Promise<string> {
    const branch = await this.prisma.restaurantBranch.findFirst({
      where: { id: branchId, ...branchScope(staff.scopes, Permission.MenuWrite) },
      select: { restaurantId: true },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    return branch.restaurantId;
  }

  private async load(staff: StaffJwtPayload, id: string) {
    const section = await this.prisma.branchMenuSection.findFirst({
      where: {
        id,
        ...menuSectionScope(staff.scopes, Permission.MenuWrite),
        ...LIVE_MENU_SECTION,
      },
      select: {
        id: true,
        branchId: true,
        categoryId: true,
        nameI18n: true,
        sortOrder: true,
        branch: { select: { restaurantId: true } },
      },
    });
    if (!section) {
      throw new NotFoundException('Menu section not found');
    }
    return section;
  }

  /**
   * The category a section may map onto: one that exists, and one still on the
   * rail.
   *
   * A retired category is refused rather than accepted quietly, because mapping
   * a shelf to it would file every dish on it under a chip no guest is ever
   * shown — the same invisibility this whole change exists to remove, arrived
   * at from the other direction.
   */
  private async assertCategoryUsable(categoryId?: string): Promise<void> {
    if (!categoryId) {
      return;
    }
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { isActive: true },
    });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    if (!category.isActive) {
      throw new UnprocessableEntityException(
        'That category has been retired and no longer appears in the app',
      );
    }
  }

  private async nextSortOrder(branchId: string): Promise<number> {
    const last = await this.prisma.branchMenuSection.findFirst({
      where: { branchId, ...LIVE_MENU_SECTION },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return Math.min((last?.sortOrder ?? -1) + 1, 999);
  }
}

function toStaffMenuSection(row: {
  id: string;
  branchId: string;
  categoryId: string | null;
  nameI18n: Prisma.JsonValue;
  sortOrder: number;
  _count: { items: number };
}): StaffMenuSection {
  return {
    id: row.id,
    branchId: row.branchId,
    categoryId: row.categoryId,
    nameI18n: (row.nameI18n ?? {}) as Record<string, string>,
    sortOrder: row.sortOrder,
    itemCount: row._count.items,
  };
}
