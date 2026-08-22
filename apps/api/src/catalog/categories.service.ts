import { Injectable } from '@nestjs/common';
import { Language } from '@amragrir/shared';
import { PrismaService } from '../prisma/prisma.service';
import { localize, type I18nField } from '../common/i18n';

export interface CategoryDto {
  id: string;
  key: string;
  icon: string | null;
  name: string;
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The chip rail, in the reader's language.
   *
   * Retired categories are left out: `is_active` is how a super admin takes one
   * off the rail without deleting the row that dishes still point at, and this
   * is the read that has to honour it. The panel's own list
   * (`GET /admin/categories`) shows them, because that is the screen that puts
   * one back.
   */
  async list(language: Language): Promise<{ items: CategoryDto[] }> {
    const rows = await this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
    });

    return {
      items: rows.map((row) => ({
        id: row.id,
        key: row.key,
        icon: row.icon,
        name: localize(row.nameI18n as I18nField, language),
      })),
    };
  }
}
