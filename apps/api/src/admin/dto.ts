import { Type } from 'class-transformer';
import {
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
} from 'class-validator';
import { CouponSource } from '@prisma/client';
import { REFERRAL_MAX_STACK_PCT, Role } from '@amragrir/shared';

/**
 * Roles an admin may assign.
 *
 * `guest` is absent because it is not a database role at all — it is the
 * `is_guest` flag (ROLES_AND_PERMISSIONS.md), and offering it here would write
 * a value the schema's enum does not have.
 */
export const ASSIGNABLE_ROLES: readonly Role[] = [
  Role.Customer,
  Role.Staff,
  Role.Owner,
  Role.Admin,
];

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

  @IsIn(Object.values(Role))
  @IsOptional()
  role?: Role;

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

export class SetRoleDto {
  @IsIn(ASSIGNABLE_ROLES)
  role!: Role;
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

  @IsUUID()
  ownerId!: string;

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
