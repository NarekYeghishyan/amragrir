import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditAction } from '@amragrir/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { changedFields } from '../audit/audit';
import { LIVE_MENU_ITEM, LIVE_MENU_SECTION } from '../common/menu-visibility';
import { stripEmpty } from '../restaurant/menu.service';
import type { StaffJwtPayload } from '../staff/staff-token.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto';

/**
 * A platform category as the panel edits it: raw translations, the retirement
 * flag, and what is riding on it.
 */
export interface StaffCategory {
  id: string;
  key: string;
  icon: string | null;
  sortOrder: number | null;
  nameI18n: Record<string, string>;
  isActive: boolean;
  /** Live dishes whose *own* category is this one. */
  itemCount: number;
  /** Live menu sections mapped to it — every dish under them inherits it, so
   *  this is the other half of "what breaks if this goes". */
  sectionCount: number;
}

/**
 * The platform's category vocabulary.
 *
 * Under `/admin` and behind `categories:write`, which only `super_admin` holds.
 * That is the whole point of the feature: this list is what every restaurant on
 * the platform is indexed by, and a second spelling of "Pizza" added by a
 * well-meaning support account splits a chip's traffic in two with nothing in
 * the product to report it.
 *
 * What restaurants may do instead is `MenuSectionsService` — name their own
 * shelves, as many as their menu needs, and point them at rows from this table.
 */
@Injectable()
export class CategoriesAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Every category, retired ones included — this is the screen that un-retires
   *  them. The public `GET /categories` shows only the live rail. */
  async list(): Promise<{ items: StaffCategory[] }> {
    const rows = await this.prisma.category.findMany({
      include: {
        _count: {
          select: {
            menuItems: { where: LIVE_MENU_ITEM },
            sections: { where: LIVE_MENU_SECTION },
          },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
    });
    return { items: rows.map(toStaffCategory) };
  }

  async create(staff: StaffJwtPayload, dto: CreateCategoryDto): Promise<StaffCategory> {
    const existing = await this.prisma.category.findUnique({
      where: { key: dto.key },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('A category with that key already exists');
    }

    const name = stripEmpty(dto.nameI18n);
    const sortOrder = dto.sortOrder ?? (await this.nextSortOrder());

    const category = await this.prisma.$transaction(async (tx) => {
      const created = await tx.category.create({
        data: {
          key: dto.key,
          icon: dto.icon ?? null,
          sortOrder,
          nameI18n: name,
        },
        include: {
          _count: {
            select: {
              menuItems: { where: LIVE_MENU_ITEM },
              sections: { where: LIVE_MENU_SECTION },
            },
          },
        },
      });

      // No scope: this belongs to no restaurant and no branch. It is the one
      // action in the table filed against the platform itself.
      await this.audit.record(tx, staff, {
        action: AuditAction.CategoryCreate,
        entityId: created.id,
        after: { key: created.key, nameI18n: name, icon: created.icon, sortOrder },
      });

      return created;
    });

    return toStaffCategory(category);
  }

  /**
   * Renames, re-icons, reorders, retires and un-retires.
   *
   * **`key` is not editable, deliberately.** It travels in `?category=`, in the
   * deep links the clients build, and in the placeholder filenames the seed
   * writes; changing it would break every one of those silently while the
   * category on screen looked fine. The display name is `nameI18n` and may
   * change any day — that is what it is for.
   */
  async update(
    staff: StaffJwtPayload,
    id: string,
    dto: UpdateCategoryDto,
  ): Promise<StaffCategory> {
    const current = await this.load(id);

    const data: Prisma.CategoryUpdateInput = {};
    if (dto.nameI18n) {
      data.nameI18n = stripEmpty(dto.nameI18n);
    }
    if (dto.icon !== undefined) {
      data.icon = dto.icon;
    }
    if (dto.sortOrder !== undefined) {
      data.sortOrder = dto.sortOrder;
    }
    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }

    const changed = changedFields(
      {
        nameI18n: current.nameI18n,
        icon: current.icon,
        sortOrder: current.sortOrder,
        isActive: current.isActive,
      },
      {
        ...(dto.nameI18n ? { nameI18n: stripEmpty(dto.nameI18n) } : {}),
        ...(dto.icon !== undefined ? { icon: dto.icon } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    );

    const category = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.category.update({
        where: { id },
        data,
        include: {
          _count: {
            select: {
              menuItems: { where: LIVE_MENU_ITEM },
              sections: { where: LIVE_MENU_SECTION },
            },
          },
        },
      });

      if (changed) {
        await this.audit.record(tx, staff, {
          action: AuditAction.CategoryUpdate,
          entityId: id,
          // The key labels the entry, since it is the one name for this row
          // that never changes and the one a reader will recognise.
          before: { ...changed.before, key: current.key },
          after: changed.after,
        });
      }

      return updated;
    });

    return toStaffCategory(category);
  }

  /**
   * Removes a category outright — only while nothing points at it.
   *
   * Anything else is a retirement (`isActive: false`), and the refusal says so.
   * Deleting a category dishes are filed under would take them out of every
   * filter on the platform at once, from a screen whose operator cannot see
   * whose menus they were on.
   */
  async remove(staff: StaffJwtPayload, id: string): Promise<void> {
    const current = await this.load(id);

    const [items, sections] = await Promise.all([
      this.prisma.menuItem.count({ where: { categoryId: id, ...LIVE_MENU_ITEM } }),
      this.prisma.branchMenuSection.count({ where: { categoryId: id, ...LIVE_MENU_SECTION } }),
    ]);
    if (items > 0 || sections > 0) {
      throw new UnprocessableEntityException(
        `In use by ${items} dish(es) and ${sections} menu section(s) — retire it instead, which hides the chip and leaves their menus alone`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.category.delete({ where: { id } });

      await this.audit.record(tx, staff, {
        action: AuditAction.CategoryDelete,
        entityId: id,
        // Hard-deleted, so `before` is the only remaining record of what this
        // row was.
        before: { key: current.key, nameI18n: current.nameI18n as Prisma.InputJsonValue },
      });
    });
  }

  private async load(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return category;
  }

  private async nextSortOrder(): Promise<number> {
    const last = await this.prisma.category.findFirst({
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return Math.min((last?.sortOrder ?? -1) + 1, 999);
  }
}

function toStaffCategory(row: {
  id: string;
  key: string;
  icon: string | null;
  sortOrder: number | null;
  nameI18n: Prisma.JsonValue;
  isActive: boolean;
  _count: { menuItems: number; sections: number };
}): StaffCategory {
  return {
    id: row.id,
    key: row.key,
    icon: row.icon,
    sortOrder: row.sortOrder,
    nameI18n: (row.nameI18n ?? {}) as Record<string, string>,
    isActive: row.isActive,
    itemCount: row._count.menuItems,
    sectionCount: row._count.sections,
  };
}
