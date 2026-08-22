import { BadRequestException, Controller, Get, Headers, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators';
import { resolveLanguage } from '../common/i18n';
import { GeocodeQueryDto } from './dto';
import { GeocodeService, type GeocodeAnswer } from './geocode.service';

/**
 * `GET /geocode` — addresses in and out of coordinates.
 *
 * **Public, like the catalog.** Saying where you are is not an account
 * operation: a guest picks a location before signing in, exactly as they browse
 * restaurants before signing in (ROLES_AND_PERMISSIONS.md — guests may browse).
 * Requiring a token would also mean the website's route could not be folded
 * into this one later, since that app deliberately never holds an API token in
 * the browser.
 *
 * **Throttled harder than the default**, because unlike the rest of the catalog
 * this one spends somebody's money: every call is a call to Yandex against a
 * metered key. 30 a minute per IP is far more than a person typing an address
 * behind a 350ms debounce and far less than a script worth having.
 */
@Public()
@Throttle({ default: { ttl: 60_000, limit: 30 } })
@Controller('geocode')
export class GeocodeController {
  constructor(private readonly geocode: GeocodeService) {}

  @Get()
  find(
    @Query() query: GeocodeQueryDto,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<GeocodeAnswer> {
    const language = resolveLanguage(acceptLanguage);

    if (query.lat !== undefined || query.lng !== undefined) {
      if (query.lat === undefined || query.lng === undefined) {
        // Half a point is not a point, and guessing which half was meant would
        // name somewhere nobody asked about.
        throw new BadRequestException('Both lat and lng are required to name a point');
      }
      return this.geocode.reverse(query.lat, query.lng, language);
    }

    // No `q` either: the client is asking whether searching is possible at all,
    // which `available` answers. That is a real question — a picker draws its
    // search box only where something can answer it.
    return this.geocode.search(query.q ?? '', language);
  }
}
