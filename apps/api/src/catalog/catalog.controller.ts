import { Controller, Get, Headers, Param, Query } from '@nestjs/common';
import { Public } from '../auth/decorators';
import { resolveLanguage } from '../common/i18n';
import { CategoriesService } from './categories.service';
import { RestaurantsService } from './restaurants.service';
import { SearchService } from './search.service';
import { ListRestaurantsDto, MenuQueryDto, SearchQueryDto } from './dto';

/**
 * Catalog is public: browsing requires no account at all (guests may browse
 * per ROLES_AND_PERMISSIONS.md), and the web app needs these pages crawlable.
 */
@Public()
@Controller()
export class CatalogController {
  constructor(
    private readonly categories: CategoriesService,
    private readonly restaurants: RestaurantsService,
    private readonly searchService: SearchService,
  ) {}

  @Get('categories')
  listCategories(@Headers('accept-language') acceptLanguage?: string) {
    return this.categories.list(resolveLanguage(acceptLanguage));
  }

  @Get('search')
  search(@Query() query: SearchQueryDto, @Headers('accept-language') acceptLanguage?: string) {
    return this.searchService.search(query, resolveLanguage(acceptLanguage));
  }

  @Get('search/popular')
  popular() {
    return this.searchService.popular();
  }

  @Get('restaurants')
  listRestaurants(
    @Query() query: ListRestaurantsDto,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    return this.restaurants.list(query, resolveLanguage(acceptLanguage));
  }

  @Get('restaurants/:id')
  getRestaurant(@Param('id') id: string, @Headers('accept-language') acceptLanguage?: string) {
    return this.restaurants.findOne(id, resolveLanguage(acceptLanguage));
  }

  @Get('restaurants/:id/menu')
  getMenu(
    @Param('id') id: string,
    @Query() query: MenuQueryDto,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    return this.restaurants.menu(id, query, resolveLanguage(acceptLanguage));
  }

  @Get('restaurants/:id/tables')
  getTables(@Param('id') id: string) {
    return this.restaurants.tables(id);
  }
}
