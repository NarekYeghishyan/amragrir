import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { DietaryTag, MenuTab, RestaurantService } from '@amragrir/shared';

export const RestaurantSort = {
  Recommended: 'recommended',
  Nearest: 'nearest',
  Fastest: 'fastest',
  TopRated: 'top_rated',
} as const;
export type RestaurantSort = (typeof RestaurantSort)[keyof typeof RestaurantSort];

/** Query strings arrive as `a,b` or repeated `?k=a&k=b`; normalise both. */
const toArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const raw = Array.isArray(value) ? value : String(value).split(',');
  return raw.map((v) => String(v).trim()).filter(Boolean);
};

export class ListRestaurantsDto {
  @IsLatitude()
  @IsOptional()
  @Type(() => Number)
  lat?: number;

  @IsLongitude()
  @IsOptional()
  @Type(() => Number)
  lng?: number;

  @IsIn(Object.values(RestaurantSort))
  @IsOptional()
  sort: RestaurantSort = RestaurantSort.Recommended;

  /** Maximum distance in km; ignored unless lat/lng are supplied. */
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  distMax?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(5)
  @Type(() => Number)
  minRating?: number;

  @IsArray()
  @IsOptional()
  @IsIn(Object.values(DietaryTag), { each: true })
  @Transform(toArray)
  dietary?: string[];

  /** Restaurant-declared services (`restaurants.services`). */
  @IsArray()
  @IsOptional()
  @IsIn(Object.values(RestaurantService), { each: true })
  @Transform(toArray)
  service?: string[];

  /** Category key, e.g. `sushi`. */
  @IsString()
  @IsOptional()
  @MaxLength(40)
  category?: string;

  /** Free-text search over restaurant name and cuisine. */
  @IsString()
  @IsOptional()
  @MaxLength(120)
  q?: string;

  /**
   * Typical spend per person, in AMD (the design's 4000–24000 slider).
   *
   * Derived from the average price of a branch's available dishes — there is
   * no stored per-person figure, and adding one would mean keeping a
   * denormalised column in step with every menu edit.
   */
  @IsInt()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  priceMin?: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  priceMax?: number;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  page = 1;

  // Capped server-side: an uncapped list is a denial-of-service waiting to
  // happen (DEVELOPMENT_GUIDE.md "API conventions").
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  limit = 20;
}

export class SearchQueryDto {
  @IsString()
  @MaxLength(120)
  q!: string;

  @IsLatitude()
  @IsOptional()
  @Type(() => Number)
  lat?: number;

  @IsLongitude()
  @IsOptional()
  @Type(() => Number)
  lng?: number;
}

export class MenuQueryDto {
  @IsIn(Object.values(MenuTab))
  @IsOptional()
  menuTab?: MenuTab;

  @IsString()
  @IsOptional()
  @MaxLength(40)
  category?: string;
}
