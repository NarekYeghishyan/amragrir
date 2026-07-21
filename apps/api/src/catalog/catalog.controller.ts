import { Controller, Get, Headers, Param, Query } from '@nestjs/common';
import { Public } from '../auth/decorators';
import { resolveLanguage } from '../common/i18n';
import { CategoriesService } from './categories.service';
import { RestaurantsService } from './restaurants.service';
import { ListRestaurantsDto, MenuQueryDto } from './dto';

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
  ) {}

  @Get('categories')
  listCategories(@Headers('accept-language') acceptLanguage?: string) {
    return this.categories.list(resolveLanguage(acceptLanguage));
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
