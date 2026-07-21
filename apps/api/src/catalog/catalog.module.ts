import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CategoriesService } from './categories.service';
import { RestaurantsService } from './restaurants.service';

@Module({
  controllers: [CatalogController],
  providers: [CategoriesService, RestaurantsService],
  exports: [RestaurantsService],
})
export class CatalogModule {}
