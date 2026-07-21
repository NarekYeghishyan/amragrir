import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DietaryTag, Language, MenuTab } from '@amragrir/shared';

/**
 * A localised text column.
 *
 * `hy` is required because it is the fallback the public API resolves to
 * (docs/API_DOCUMENTATION.md). Without it a dish would render as an empty
 * label for anyone whose language is missing — which is every guest, on a
 * screen that is supposed to sell food.
 */
export class I18nTextDto {
  // Keys are the `Language` values from @amragrir/shared, spelled out because
  // class-validator reads plain property names for its error messages.
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  hy!: string;

  @IsString()
  @IsOptional()
  @MaxLength(160)
  ru?: string;

  @IsString()
  @IsOptional()
  @MaxLength(160)
  en?: string;
}

export class I18nBodyDto {
  @IsString()
  @IsOptional()
  @MaxLength(600)
  hy?: string;

  @IsString()
  @IsOptional()
  @MaxLength(600)
  ru?: string;

  @IsString()
  @IsOptional()
  @MaxLength(600)
  en?: string;
}

/** Compile-time proof the keys above are exactly the supported languages —
 *  adding a language to `shared` without adding it here becomes an error. */
const _languageKeysMatch: Record<Language, unknown> = {
  hy: null,
  ru: null,
  en: null,
} satisfies Record<keyof I18nBodyDto, unknown>;
void _languageKeysMatch;

/** Sanity bounds. A dish nobody could cook in a day is a typo, not a dish. */
const MAX_PREP_MIN = 480;
const MAX_PRICE_AMD = 10_000_000;

export class CreateMenuItemDto {
  @IsUUID()
  branchId!: string;

  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @IsIn(Object.values(MenuTab))
  menuTab!: MenuTab;

  @ValidateNested()
  @Type(() => I18nTextDto)
  nameI18n!: I18nTextDto;

  @ValidateNested()
  @Type(() => I18nBodyDto)
  @IsOptional()
  descI18n?: I18nBodyDto;

  // Integer dram: the currency has no minor unit, so a fractional price is a
  // mistake rather than a rounding question.
  @IsInt()
  @Min(0)
  @Max(MAX_PRICE_AMD)
  @Type(() => Number)
  priceAmd!: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  caloriesKcal?: number;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(MAX_PREP_MIN)
  @Type(() => Number)
  prepMin?: number;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  photoUrl?: string;

  @IsArray()
  @IsOptional()
  @IsIn(Object.values(DietaryTag), { each: true })
  dietaryTags?: DietaryTag[];

  @IsBoolean()
  @IsOptional()
  isAvailable?: boolean;
}

/**
 * Every field optional — a PATCH may carry one.
 *
 * `branchId` is absent on purpose: moving a dish between branches would change
 * who owns it, and the ownership check runs against the branch it is already
 * in. That is a different operation, not an edit.
 */
export class UpdateMenuItemDto {
  @IsUUID()
  @IsOptional()
  categoryId?: string | null;

  @IsIn(Object.values(MenuTab))
  @IsOptional()
  menuTab?: MenuTab;

  @ValidateNested()
  @Type(() => I18nTextDto)
  @IsOptional()
  nameI18n?: I18nTextDto;

  @ValidateNested()
  @Type(() => I18nBodyDto)
  @IsOptional()
  descI18n?: I18nBodyDto;

  @IsInt()
  @IsOptional()
  @Min(0)
  @Max(MAX_PRICE_AMD)
  @Type(() => Number)
  priceAmd?: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  caloriesKcal?: number;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(MAX_PREP_MIN)
  @Type(() => Number)
  prepMin?: number;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  photoUrl?: string;

  @IsArray()
  @IsOptional()
  @IsIn(Object.values(DietaryTag), { each: true })
  dietaryTags?: DietaryTag[];

  @IsBoolean()
  @IsOptional()
  isAvailable?: boolean;
}

export class ListMenuItemsDto {
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @IsIn(Object.values(MenuTab))
  @IsOptional()
  menuTab?: MenuTab;
}

export class UpdateBranchDto {
  /**
   * The "we are open" switch the counter actually uses during a shift.
   *
   * `reservationsEnabled` is *not* here: it lives on the restaurant, not the
   * branch, so setting it from a branch endpoint would silently change every
   * other branch too. It lands with the reservations module.
   */
  @IsBoolean()
  @IsOptional()
  isOpen?: boolean;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(MAX_PREP_MIN)
  @Type(() => Number)
  avgPrepMin?: number;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  address?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  phone?: string;
}
