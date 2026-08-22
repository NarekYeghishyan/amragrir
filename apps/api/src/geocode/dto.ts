import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * One endpoint, two shapes: `?q=…` searches, `?lat=&lng=` names a point.
 *
 * Both are optional here and the controller decides, because a DTO cannot say
 * "either these two or that one" without a custom validator that would report
 * the mistake worse than a plain sentence does.
 */
export class GeocodeQueryDto {
  /** Capped because it is forwarded to a third party as a query string, and a
   *  megabyte of it is not a search anybody typed. */
  @IsString()
  @IsOptional()
  @MaxLength(200)
  q?: string;

  @IsLatitude()
  @IsOptional()
  @Type(() => Number)
  lat?: number;

  @IsLongitude()
  @IsOptional()
  @Type(() => Number)
  lng?: number;
}
