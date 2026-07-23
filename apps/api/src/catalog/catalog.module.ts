import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CategoriesService } from './categories.service';
import { RestaurantsService } from './restaurants.service';
import { SearchService } from './search.service';

@Module({
  controllers: [CatalogController],
  providers: [CategoriesService, RestaurantsService, SearchService],
  exports: [RestaurantsService, SearchService],
})
export class CatalogModule {}
