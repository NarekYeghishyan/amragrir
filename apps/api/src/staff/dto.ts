import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { StaffRole } from '@amragrir/shared';

/**
 * Minimum password length.
 *
 * 12, not 8: this is a back office where one account can change every price in
 * a restaurant, and the accounts are few enough that the friction is bearable.
 * No composition rules — they push people toward `Password1!` and a length
 * floor is worth more than a symbol requirement.
 */
const MIN_PASSWORD = 12;
const MAX_PASSWORD = 200;

export class StaffLoginDto {
  @IsEmail()
  @MaxLength(160)
  email!: string;

  @IsString()
  @MaxLength(MAX_PASSWORD)
  password!: string;
}

export class StaffRefreshDto {
  @IsString()
  @MinLength(10)
  refreshToken!: string;
}

export class CreateInviteDto {
  @IsEmail()
  @MaxLength(160)
  email!: string;

  @IsEnum(StaffRole)
  role!: StaffRole;

  /** Required for `restaurant_admin`, refused for every other role. */
  @IsOptional()
  @IsUUID()
  restaurantId?: string;

  /** Required for `restaurant_manager` and `branch_staff`. */
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

/**
 * Narrowing the people list — and the invitations, which take the same query.
 *
 * Both paginate, per DEVELOPMENT_GUIDE.md's "list endpoints paginate and cap
 * `limit`". The invitations did not, on the reasoning that there are never
 * many: true today, not a ceiling, and an uncapped list is a denial of service
 * waiting to happen rather than a prediction about how a platform gets used.
 */
export class ListStaffDto {
  /** A name or email, or the restaurant or branch someone is assigned to —
   *  one box over everything the card shows. */
  @IsString()
  @IsOptional()
  @MaxLength(80)
  q?: string;

  /**
   * One person exactly, for a link that means "this one".
   *
   * `q` cannot do it: it is a `contains` over names and emails, so a name two
   * people share, or an address that is another's prefix, answers with both —
   * and the order history links here by id because it has an id, not a search
   * term. Narrows the same list rather than opening a different one, so the
   * caller's reach still decides whether the person appears at all.
   */
  @IsUUID()
  @IsOptional()
  id?: string;

  /** Narrows to people holding this role *somewhere in the caller's reach*.
   *  Never to a role held outside it, which is the same rule the rest of this
   *  module runs on. */
  @IsEnum(StaffRole)
  @IsOptional()
  role?: StaffRole;

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
 * One team, paged — a restaurant's own roles, or one branch's.
 *
 * No `q` and no `role`: a team is asked for by opening the thing it works for,
 * and both lists are already narrowed to that one scope. Fifty is far past what
 * either holds; a branch with more than fifty people on it is a scroll rather
 * than a search problem. Added when it is.
 */
export class ListTeamDto {
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
  limit = 50;
}

/**
 * One person's activity, paged.
 *
 * `page` is capped, which no other list here does. The feed merges two tables by
 * offset, so answering "page 500" means fetching the first ten thousand rows of
 * each and throwing almost all of them away — the cost is in the offset, not the
 * page size. Twenty-five pages is far more than anybody scrolls to review
 * somebody's work, and a date filter is the right answer for going further back
 * whenever someone actually needs to.
 */
export class ListActivityDto {
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(25)
  @Type(() => Number)
  page = 1;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  limit = 20;
}

export class AcceptInviteDto {
  @IsString()
  @MinLength(10)
  token!: string;

  @IsString()
  @MinLength(MIN_PASSWORD, {
    message: `Password must be at least ${MIN_PASSWORD} characters`,
  })
  @MaxLength(MAX_PASSWORD)
  password!: string;

  /** Optional: an invite may already carry a name, and this lets the person
   *  correct it while they are here. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  @MaxLength(160)
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(10)
  token!: string;

  @IsString()
  @MinLength(MIN_PASSWORD, {
    message: `Password must be at least ${MIN_PASSWORD} characters`,
  })
  @MaxLength(MAX_PASSWORD)
  password!: string;
}
