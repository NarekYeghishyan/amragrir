import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  DietaryTag,
  Language,
  MenuTab,
  RestaurantService,
  SERVICE_ORDER,
} from '@amragrir/shared';

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

/**
 * What counts as a photo.
 *
 * An absolute `http(s)` URL — normally the one `POST /uploads/menu-photo` just
 * answered with, though an image hosted anywhere reachable is accepted too.
 * `require_tld: false` keeps `http://localhost:3000/uploads/…` working in
 * development, which is what the upload endpoint answers with there; without it
 * the only addresses that validate are ones a developer cannot serve locally.
 */
const PHOTO_URL = { protocols: ['http', 'https'], require_protocol: true, require_tld: false };

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

  /**
   * How long it takes to cook — **`0` is a real answer**.
   *
   * A bottle of water, a canned drink, a cake already on the counter: they are
   * handed over, not cooked, and a floor of one minute made the panel refuse the
   * truest thing somebody could type about them. `0` and absent are still
   * different: `0` is the dish saying it needs no time, absent is it saying
   * nothing and letting the branch's average stand in.
   */
  @IsInt()
  @IsOptional()
  @Min(0)
  @Max(MAX_PREP_MIN)
  @Type(() => Number)
  prepMin?: number;

  /**
   * The dish's photograph — **required**.
   *
   * A menu is a list somebody reads with their eyes: a dish with no picture
   * sits under the ones that have one and does not get ordered, and nobody
   * comes back afterwards to fix it — so it is asked for at the one moment
   * somebody is definitely thinking about the dish. This was optional until
   * now, which is why dishes exist without one; the column stays nullable for
   * them (see `photo_url` in DATABASE.md).
   *
   * Trimmed before it is checked, or a pasted `"  "` would satisfy
   * `@IsNotEmpty` and store a photo that resolves to nothing.
   */
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty()
  @IsUrl(PHOTO_URL)
  @MaxLength(500)
  photoUrl!: string;

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

  /**
   * How long it takes to cook — or `null` for "no longer says".
   *
   * The one field here where `null` is a legitimate value rather than a mistake:
   * the column is nullable, an estimate can turn out to be wrong, and a panel
   * that could set one but never unset it would leave every guess permanent.
   * `@IsOptional()` skips `null` as well as absent, which is exactly the
   * distinction wanted — absent leaves the estimate alone, `null` removes it.
   * The opposite of `photoUrl` below, and for the opposite reason.
   *
   * `0` is a third thing again, and not a way of writing `null`: it is a dish
   * that takes no cooking (see `CreateMenuItemDto.prepMin`), which is a claim
   * the kitchen makes rather than a question it declines to answer.
   */
  @IsInt()
  @IsOptional()
  @Min(0)
  @Max(MAX_PREP_MIN)
  @Type(() => Number)
  prepMin?: number | null;

  /**
   * A different photo — never *no* photo.
   *
   * `@ValidateIf` rather than `@IsOptional()`, which is what the rest of this
   * class uses: `@IsOptional()` skips validation for `null` as well as for
   * absent, and a `null` that reaches the update would be written straight to
   * the column. Leaving the field out is how a PATCH says "not this one";
   * sending `null` or `""` is how it would take the picture off a dish that is
   * required to have one, so both are refused.
   */
  @ValidateIf((dto: UpdateMenuItemDto) => dto.photoUrl !== undefined)
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty()
  @IsUrl(PHOTO_URL)
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

/**
 * Narrowing the restaurants list.
 *
 * Paged like every other list endpoint. It was not, which was survivable while
 * an account reached two restaurants and stopped being so at twenty-five —
 * the panel was rendering every restaurant and every branch it could see, in
 * one seven-thousand-pixel page.
 */
export class ListRestaurantsDto {
  /** Restaurant name, slug, or the name or address of one of its branches. */
  @IsString()
  @IsOptional()
  @MaxLength(80)
  q?: string;

  /** Narrow to one restaurant. Narrows the caller's reach, never widens it. */
  @IsUUID()
  @IsOptional()
  restaurantId?: string;

  /** Narrow to one branch — the restaurant that owns it, showing only it. */
  @IsUUID()
  @IsOptional()
  branchId?: string;

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

/** Flipping one dish sold out, which is all a shift may change about a menu. */
export class SetAvailabilityDto {
  @IsBoolean()
  isAvailable!: boolean;
}

/**
 * The shift's own controls: whether the branch is taking orders, and how long
 * food is currently taking.
 *
 * Split out of `UpdateBranchDto` because these two fields sit on a narrower
 * permission (`branch:hours`) than the branch's standing details — a shift may
 * stop the queue without being able to change the address.
 */
export class SetBranchStatusDto {
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
}

/**
 * A new branch.
 *
 * `isOpen` is absent on purpose — a branch is created closed and opened from
 * the shift switch once it has a menu.
 */
export class CreateBranchDto {
  @IsUUID()
  restaurantId!: string;

  @IsString()
  @IsOptional()
  @MaxLength(160)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  address?: string;

  @IsString()
  @IsOptional()
  @MaxLength(80)
  city?: string;

  // Yerevan is around 40.18, 44.51. The bounds are the globe's, not the
  // city's: a second branch in Gyumri is a real thing, a latitude of 400 is not.
  @IsNumber()
  @IsOptional()
  @Min(-90)
  @Max(90)
  @Type(() => Number)
  lat?: number;

  @IsNumber()
  @IsOptional()
  @Min(-180)
  @Max(180)
  @Type(() => Number)
  lng?: number;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  phone?: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(MAX_PREP_MIN)
  @Type(() => Number)
  avgPrepMin?: number;
}

/**
 * How a restaurant will feed people — the whole set, not a delta.
 *
 * Sent whole because the rules in `service-offering.ts` are about combinations:
 * "is dine-in allowed here" cannot be answered without knowing whether the
 * eat-in option is on, so a body naming one service at a time would have to be
 * validated against a set the caller may not have looked at since. Whole sets
 * also make the request idempotent, and make "somebody else changed this while
 * the form was open" a wrong answer rather than a silent half-merge.
 *
 * This only checks the *vocabulary*. Whether the combination describes a real
 * restaurant is the service's check, because it is a business rule with a
 * sentence attached rather than a shape.
 */
export class SetRestaurantServicesDto {
  @IsArray()
  // Longer than the vocabulary is not a set of services, whatever is in it.
  @ArrayMaxSize(SERVICE_ORDER.length)
  @IsIn(Object.values(RestaurantService), { each: true })
  services!: RestaurantService[];
}

/**
 * The photograph on the restaurant's card — normally the URL
 * `POST /uploads/restaurant-cover` just answered with.
 *
 * **`null` is a real value here**, and this is the difference from a dish's
 * `photoUrl`: a dish is required to have a picture, so `null` there is a
 * mistake to refuse, while a restaurant that wants its photograph taken down
 * has no other way to say so and the column is nullable for exactly that. Every
 * client already draws the no-cover state, because until now that state was all
 * there was.
 *
 * `@ValidateIf` rather than `@IsOptional()`: the latter would skip an *absent*
 * field too, and a PATCH with an empty body would then read as "take it down"
 * — the one interpretation nobody typing it would have meant. Absent is
 * refused, `null` removes, a URL replaces.
 */
export class SetRestaurantCoverDto {
  @ValidateIf((dto: SetRestaurantCoverDto) => dto.coverUrl !== null)
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty()
  @IsUrl(PHOTO_URL)
  @MaxLength(500)
  coverUrl!: string | null;
}

/**
 * This branch's own cover — or `null` to wear the restaurant's again.
 *
 * `null` is **not** "no picture", which is the difference from the restaurant's
 * own endpoint: a branch that has nothing of its own falls back to the
 * business, because a blank card beside a business that has a photograph is
 * worse than showing the business's. There is deliberately no way to be blank
 * here.
 */
export class SetBranchCoverDto {
  @ValidateIf((dto: SetBranchCoverDto) => dto.coverUrl !== null)
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty()
  @IsUrl(PHOTO_URL)
  @MaxLength(500)
  coverUrl!: string | null;
}

/**
 * What this branch offers — or `null` to follow the restaurant again.
 *
 * The whole set, for the reasons `SetRestaurantServicesDto` gives; the rules in
 * `checkServices` now judge one address rather than the business.
 *
 * **`[]` and `null` are different answers.** `[]` is this branch declaring it
 * offers nothing, overriding a parent that offers pickup; `null` is the branch
 * handing the question back. Every restaurant is created having declared
 * nothing, so emptiness could never have meant "unset" — which is why the
 * column carries a separate `services_overridden` flag.
 */
export class SetBranchServicesDto {
  @ValidateIf((dto: SetBranchServicesDto) => dto.services !== null)
  @IsArray()
  @ArrayMaxSize(SERVICE_ORDER.length)
  @IsIn(Object.values(RestaurantService), { each: true })
  services!: RestaurantService[] | null;
}

/** Whether this branch takes table bookings, or `null` to follow the
 *  restaurant's. Its own request rather than a field on the services above,
 *  because they are two columns and either moves without the other. */
export class SetBranchBookingsDto {
  @ValidateIf((dto: SetBranchBookingsDto) => dto.reservationsEnabled !== null)
  @IsBoolean()
  reservationsEnabled!: boolean | null;
}

/** A branch's standing details — the things that outlive a shift. */
export class UpdateBranchDto {
  @IsString()
  @IsOptional()
  @MaxLength(160)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  address?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  phone?: string;
}
