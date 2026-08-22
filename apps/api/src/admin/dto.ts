import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CouponSource } from '@prisma/client';
import {
  CATEGORY_KEY_PATTERN,
  CustomerOrderFilter,
  REFERRAL_MAX_STACK_PCT,
  Role,
} from '@amragrir/shared';
import { toBool } from '../common/query';
// The one shape both halves of the platform share: a translated label, with
// Armenian required because it is what the public API falls back to.
import { I18nTextDto } from '../restaurant/menu.dto';

export class MetricsQueryDto {
  @IsISO8601()
  @IsOptional()
  from?: string;

  @IsISO8601()
  @IsOptional()
  to?: string;
}

export class ListUsersDto {
  /** Matches a phone, name or email fragment. */
  @IsString()
  @IsOptional()
  @MaxLength(120)
  q?: string;

  /**
   * One customer exactly, for a link that means "this one".
   *
   * The order history names a diner and knows their id; it does not know a
   * search term that would find only them. A name is shared, and the phone this
   * screen shows is masked, so `q` has nothing unambiguous to be given.
   */
  @IsUUID()
  @IsOptional()
  id?: string;

  @IsIn(Object.values(Role))
  @IsOptional()
  role?: Role;

  /**
   * Include the anonymous sessions that have never ordered.
   *
   * Off by default, and that default is the useful one: a row is created for
   * every visitor who opens the storefront (`AuthService.createGuest`), so a
   * list ordered newest-first is otherwise page after page of accounts with no
   * name, no number and nothing bought — with the people who actually order
   * buried behind them.
   *
   * They are hidden, never deleted: a guest is a real session, and one that
   * *has* ordered stays in the list either way (see `AdminService.listUsers`).
   */
  @IsBoolean()
  @IsOptional()
  @Transform(toBool)
  guests?: boolean;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  page = 1;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  limit = 20;
}

/**
 * One customer's orders, a page at a time, narrowed.
 *
 * The customer is fixed by the path, so neither of these narrows *who* — they
 * narrow which of a regular's three hundred orders is the one being asked
 * about. Paging back through thirty pages to find a cancellation from March is
 * not a way to answer a support call.
 *
 * Ten per page rather than the customer list's twenty-five, because these rows
 * open: each carries every line of its order, and a dialog is a smaller window
 * than a page.
 */
export class ListCustomerOrdersDto {
  /**
   * Matches an order code, a dish on the order, or where it was bought.
   *
   * Those three and not the customer's name, which the board's search matches
   * and which would match every row here by construction. They are what somebody
   * has to go on: the code off a receipt, "the one with the khorovats", or
   * "whatever they ordered at Dolmama".
   */
  @IsString()
  @IsOptional()
  @MaxLength(120)
  q?: string;

  /** Defaults to `all` — the whole history, which is what opening this without
   *  touching anything should show. */
  @IsIn(Object.values(CustomerOrderFilter))
  @IsOptional()
  status?: CustomerOrderFilter;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  page = 1;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  limit = 10;
}

export class CreateRestaurantDto {
  // Lowercase, hyphenated: the slug is a public URL on apps/web, so it is
  // constrained here rather than left to whatever an admin types.
  @IsString()
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase words separated by hyphens',
  })
  @MinLength(2)
  @MaxLength(80)
  slug!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  /**
   * Who will run it. Optional: a restaurant may be created before its
   * administrator is known, and invited from the staff screen later.
   *
   * An email rather than an account id, because the account usually does not
   * exist yet — this sends them an invitation. There is no `ownerId` any more:
   * a restaurant is administered through a `restaurant_admin` assignment, not
   * by a column pointing at a customer.
   */
  @IsEmail()
  @IsOptional()
  @MaxLength(160)
  adminEmail?: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  cuisine?: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(4)
  @Type(() => Number)
  priceLevel?: number;
}

export class IssuePromoDto {
  // Uppercase so a code is unambiguous when read aloud or retyped; the lookup
  // upper-cases too, so the two cannot disagree.
  @IsString()
  @Matches(/^[A-Z0-9]+$/, { message: 'code must be uppercase letters and digits' })
  @MinLength(3)
  @MaxLength(20)
  code!: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(REFERRAL_MAX_STACK_PCT)
  @Type(() => Number)
  discountPct?: number;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  discountAmd?: number;

  @IsISO8601()
  @IsOptional()
  validUntil?: string;

  /**
   * Who gets it. Omit for every verified customer.
   *
   * A promo is money, so the audience is explicit rather than a filter this
   * endpoint invents.
   */
  @IsUUID(undefined, { each: true })
  @IsOptional()
  userIds?: string[];
}

export const PROMO_SOURCE = CouponSource.promo;

/**
 * A new platform category.
 *
 * `key` is the permanent one — the value in `?category=`, in deep links and in
 * the seed's placeholder filenames — so it is asked for once, checked against
 * `CATEGORY_KEY_PATTERN`, and never editable afterwards. Everything a guest
 * reads is `nameI18n`, which may change any day.
 */
export class CreateCategoryDto {
  @IsString()
  @MaxLength(40)
  @Matches(CATEGORY_KEY_PATTERN, {
    message: 'key must be lowercase latin letters, digits and underscores, starting with a letter',
  })
  key!: string;

  /** One emoji, which is what the chip rail draws. */
  @IsString()
  @IsOptional()
  @MaxLength(8)
  icon?: string;

  @ValidateNested()
  @Type(() => I18nTextDto)
  nameI18n!: I18nTextDto;

  @IsInt()
  @IsOptional()
  @Min(0)
  @Max(999)
  @Type(() => Number)
  sortOrder?: number;
}

export class UpdateCategoryDto {
  /** `key` is deliberately absent — see `CategoriesAdminService.update`. */
  @IsString()
  @IsOptional()
  @MaxLength(8)
  icon?: string | null;

  @ValidateNested()
  @Type(() => I18nTextDto)
  @IsOptional()
  nameI18n?: I18nTextDto;

  @IsInt()
  @IsOptional()
  @Min(0)
  @Max(999)
  @Type(() => Number)
  sortOrder?: number;

  /** `false` retires the category: the chip leaves the rail and the filter, and
   *  every dish filed under it keeps its row. Reversible. */
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
