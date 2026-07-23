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

  async list(language: Language): Promise<{ items: CategoryDto[] }> {
    const rows = await this.prisma.category.findMany({
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
